import { PrismaClient } from "@prisma/client";
import { load } from "cheerio";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Cluster } from "puppeteer-cluster";

async function main() {
  puppeteer.use(StealthPlugin());
  const prisma = new PrismaClient();

  const cluster = await Cluster.launch({
    puppeteerOptions: {
      headless: false,
      executablePath: "/usr/bin/google-chrome",
    },
    maxConcurrency: 2,
    concurrency: Cluster.CONCURRENCY_CONTEXT,
  });

  const processState = {
    postLinks: [],
    sites: [],
    query: "remote recruiter",
    changingPost: [],
    trigger: true,
    index: 0,
    terminate: false,
    postLinksLength: 0,
  };

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data.slice(0, 40)}: ${err.message}`);
    processState.index += 1;
    processState.trigger = true;
  });

  const sleep = (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };

  const extractCities = async ({ page, data: url }) => {
    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();

    const $ = load(html);

    $("body")
      .find(".colmask")
      .each((indexCountry, country) => {
        // Country
        if (indexCountry <= 2) {
          $(country)
            .find(".box")
            .each((boxIndex, box) => {
              //   Box
              if (indexCountry === 2 && boxIndex === 3) {
                $(box)
                  .find("ul")
                  .each((listIndex, list) => {
                    //   List
                    if (listIndex === 4) {
                      $(list)
                        .find("a")
                        .each((_, cities) => {
                          const urls = $(cities).attr("href");
                          const tags = [
                            `${urls}/search/jjj?query=${processState.query}`,
                          ];

                          processState.sites.push(...tags);
                        });
                    }
                  });
              } else {
                $(box)
                  .find("ul")
                  .each((_, list) => {
                    //   List
                    $(list)
                      .find("a")
                      .each((_, cities) => {
                        const urls = $(cities).attr("href");
                        const tags = [
                          `${urls}/search/jjj?query=${processState.query}`,
                        ];

                        processState.sites.push(...tags);
                      });
                  });
              }
            });
        }
      });
  };

  const extractPostLinks = async ({ page, data: url }) => {
    processState.trigger = false;
    processState.postLinks = [...new Set(processState.postLinks)];

    console.log(
      "Starting link: ",
      processState.sites.indexOf(url) + 1,
      "of " +
        processState.sites.length +
        " Posts extracted so far: " +
        processState.postLinks.length
    );

    const postLinks = [];

    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();

    const $ = load(html);

    const value = $("body")
      .find("main")
      .find(".title-blob")
      .find("a")
      .each(async (_, link) => {
        const urls = $(link).attr("href");
        postLinks.push(urls);
      });

    if (value.length === 0) {
      throw new Error("No postings");
    } else {
      processState.changingPost = postLinks;
      const filteredPostLinks = postLinks.filter(
        (url) => !processState.postLinks.includes(url)
      );

      processState.postLinks.push(...postLinks);

      if (filteredPostLinks.length === 0) {
        throw new Error("The " + postLinks.length + " posts already exist");
      }

      function task(index, url) {
        setTimeout(() => {
          cluster.queue(url, extractJob);
          if (index === filteredPostLinks.length - 1) {
            processState.index += 1;
            processState.trigger = true;
          }
        }, 2000 * index);
      }

      for (let index = 0; index < filteredPostLinks.length; index++) {
        processState.postLinksLength = filteredPostLinks.length;
        task(index, filteredPostLinks[index]);
      }
    }
  };

  const extractJob = async ({ page, data: url }) => {
    console.log(
      `extracting post ${processState.changingPost.indexOf(url) + 1}  of ${
        processState.changingPost.length
      }`
    );
    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();

    const $ = load(html);

    const dataStructure = {
      title: "",
      body: "",
      notices: "",
      time: "",
      compensation: "",
      employmentType: "",
      jobTitle: "",
      postId: "",
      url,
    };

    if (!$("body").find("#titletextonly").text()) return null;

    dataStructure.title = $("body").find("#titletextonly").text();
    dataStructure.body = $("body").find("#postingbody").text();
    dataStructure.notices = $("body").find(".notices").text();
    dataStructure.time = $("body").find("time").text();
    $("body")
      .find(".postinginfo")
      .each((index, id) => {
        index === 1
          ? (dataStructure.postId = $(id).text().split(": ")[1])
          : "empty";
      });

    $("body")
      .find(".attrgroup")
      .find("span")
      .each((index, attributes) => {
        const value = $(attributes).text();
        if (index === 0) {
          dataStructure.compensation = value.split(":")[1] || "";
        } else if (index === 1) {
          dataStructure.employmentType = value.split(":")[1] || "";
        } else {
          dataStructure.jobTitle = value.split(":")[1] || "";
        }
      });

    async function main() {
      await prisma.job.upsert({
        where: { postId: dataStructure.postId },
        update: { ...dataStructure },
        create: { ...dataStructure },
      });
    }

    main()
      .then(async () => {
        await prisma.$disconnect();
      })
      .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
      });
  };

  cluster.queue("https://www.craigslist.org/about/sites", extractCities);
  await sleep(10000);

  processState.sites = [...new Set(processState.sites)];
  console.log(processState.sites.length);

  while (!processState.terminate) {
    console.log("Starting loop");

    if (processState.trigger) {
      console.log("Starting queue");
      cluster.queue(processState.sites[processState.index], extractPostLinks);
      await sleep(4000);
    }
    if (!processState.trigger && processState.postLinksLength != 0) {
      await sleep(2000 * processState.postLinksLength - 2);
    }
    if (processState.index === processState.sites.length) {
      processState.terminate = true;
    }
  }

  await cluster.idle();
  await cluster.close();
}

main();
