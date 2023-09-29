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
  };

  cluster.on("taskerror", (err, data) => {
    console.log(`Error crawling ${data}: ${err.message}`);
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
      .each((_, country) => {
        // Country
        $(country)
          .find(".box")
          .each((_, box) => {
            //   Box
            $(box)
              .find("ul")
              .each((_, list) => {
                //   List
                $(list)
                  .find("a")
                  .each((_, cities) => {
                    const urls = $(cities).attr("href");
                    const tags = [
                      `${urls}/search/hum`,
                      `${urls}/search/sof`,
                      `${urls}/search/sad`,
                      `${urls}/search/tch`,
                      `${urls}/search/web`,
                      `${urls}/search/cpg`,
                    ];

                    processState.sites.push(...tags);
                  });
              });
          });
      });
  };

  const extractPostLinks = async ({ page, data: url }) => {
    await sleep(3000);
    processState.postLinks = [...new Set(processState.postLinks)];

    console.log(
      "Starting link: ",
      processState.sites.indexOf(url) + 1,
      "of 4248 " + " Posts: " + processState.postLinks.length
    );

    await page.goto(url, { waitUntil: "networkidle2" });
    const html = await page.content();

    const $ = load(html);

    const value = $("body")
      .find("main")
      .find(".title-blob")
      .find("a")
      .each(async (_, link) => {
        const urls = $(link).attr("href");
        processState.postLinks.push(urls);
      });

    if (value.length === 0) {
      throw new Error("No postings");
    }
  };

  const extractJob = async ({ page, data: url }) => {
    console.log("extracting job");
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
    await sleep(3000);
  };

  cluster.queue("https://www.craigslist.org/about/sites", extractCities);
  await sleep(10000);
  // takes 4 wait for 10 seconds to get all 4284 links
  processState.sites = [...new Set(processState.sites)];
  console.log(processState.sites.length);

  processState.sites.sort().map(async (site) => {
    await cluster.queue(site, extractPostLinks);
  });

  processState.postLinks.sort().map(async (link) => {
    await cluster.queue(link, extractJob);
  });

  await cluster.idle();
  await cluster.close();
}

main();
