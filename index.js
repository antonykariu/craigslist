import { PrismaClient } from "@prisma/client";
import { load } from "cheerio";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { EventEmitter, errorMonitor } from "events";
import { Cluster } from "puppeteer-cluster";


process.setMaxListeners(30);

puppeteer.use(StealthPlugin());
const prisma = new PrismaClient();

class Scraper extends EventEmitter {}
const scraper = new Scraper();

const Events = {
  START: "START",
  LINKS: "LINKS",
  POST_LINKS: "POST_LINKS",
  POSTS: "POSTS",
  DB: "DB",
};

const processState = {
  sites: [],
  links: 75,
  linkTimer: 10000,
  postTimer: 1000,
  postLinks: [],
};

scraper.on(Events.START, scrapeSiteUrls);
scraper.on(Events.LINKS, combinePostingLinks);
scraper.on(Events.POST_LINKS, scrapePostingLinks);
scraper.on(Events.POSTS, combinePostData);
scraper.on(Events.DB, scrapeJob);

scraper.emit("START");

scraper.on(errorMonitor, (error) => {
  console.error(error);
});

let browser;

async function fetchSite(url) {
  browser = await puppeteer.launch({
    headless: false,
    executablePath: "/usr/bin/google-chrome",
  });

  let [page] = await browser.pages();

  await page.goto(url);

  const html = await page.content();
  return html;
}

async function combinePostingLinks(sites) {
  await sites.sort();
  console.log(sites[processState.links]);
  scraper.emit(Events.POST_LINKS, sites[processState.links]);

  await sleep(processState.linkTimer);

  if (processState.postLinks.length > 0) {
    scraper.emit(Events.POSTS, processState.postLinks);
  }
}

async function combinePostData(links) {
  links = [...new Set(links)];

  scraper.emit(Events.DB, links[0]);
  await sleep(1000);
  processState.postLinks.shift();
  await links.shift();

  if (links.length > 0) {
    console.log(
      `City: ${processState.links + 1} of 714, Countdown: ${
        links.length
      }, Post Link: ${links[0]}`
    );
    scraper.emit(Events.POSTS, links);
  } else if (links.length === 0 && processState.postLinks.length === 0) {
    console.log(`Starting link ${processState.links + 2}`);
    processState.links += 1;
    await sleep(1000);
    scraper.emit(Events.LINKS, processState.sites);
  }
}

async function scrapePostingLinks(url) {
  const searchTags = [
    "/search/hum",
    "/search/sof",
    "/search/sad",
    "/search/tch",
    "/search/web",
    "/search/cpg",
  ];

  searchTags.sort().map(async (tag, index) => {
    await fetchSite(`${url}${tag}`)
      .then(async (result) => {
        const $ = load(result);

        const value = $("body")
          .find("main")
          .find(".title-blob")
          .find("a")
          .each((_, link) => {
            const url = $(link).attr("href");
            processState.postLinks.push(url);
          });

        if (
          value.length === 0 &&
          processState.links <= 713 &&
          index === searchTags.length - 1 &&
          processState.postLinks.length === 0
        ) {
          // start again
          console.log("Skipping");
          processState.links += 1;
          await sleep(1000);
          scraper.emit(Events.LINKS, processState.sites);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => browser?.close());
  });
}

async function scrapeJob(url) {
  await fetchSite(url)
    .then(async (result) => {
      const $ = load(result);

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
    })
    .catch((err) => console.error(err))
    .finally(() => browser?.close());
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function scrapeSiteUrls() {
  await fetchSite("https://www.craigslist.org/about/sites")
    .then((result) => {
      const $ = load(result);
      const sites = [];

      $("body")
        .find(".colmask")
        .each((index, country) => {
          // Country
          $(country)
            .find(".box")
            .each((index, box) => {
              //   Box
              $(box)
                .find("ul")
                .each((index, list) => {
                  //   List
                  $(list)
                    .find("a")
                    .each((index, url) => {
                      const urls = $(url).attr("href");
                      sites.push(urls);
                    });
                });
            });
        });

      processState.sites.push(...sites);
      scraper.emit(Events.LINKS, sites);
    })
    .catch((err) => console.error(err))
    .finally(() => browser?.close());
}
