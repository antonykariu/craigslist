import { PrismaClient } from "@prisma/client";
import { load } from "cheerio";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { EventEmitter, errorMonitor } from "events";

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
  links: 0,
  posts: 0,
  linkTimer: 20000,
  postTimer: 1000,
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

async function fetchSite(url) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: "/usr/bin/google-chrome",
  });

  const page = await browser.newPage();
  // Setting page view
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto(url, { waitUntil: "networkidle2" });

  const html = await page.content();
  await page.close();
  await browser.close();
  return html;
}

const allPostLinks = [];

async function combinePostingLinks(sites) {
  const localCopy = allPostLinks
  sites.sort();
  await sleep(processState.linkTimer);
  console.log(processState, sites[processState.links]);
  scraper.emit(Events.POST_LINKS, sites[processState.links]);

  if (processState.links < sites.length - 1) {
    scraper.emit(Events.LINKS, sites);
  } else if (processState.links > sites.length -2) {
    console.log("switching to posts");
    scraper.emit(Events.POSTS, localCopy);
  }
}

async function combinePostData(links) {
  console.log("starting")
  links = [...new Set(links)]
  await sleep(processState.postTimer);
  console.log(links[processState.posts])
  console.log(processState, links[processState.posts]);
  scraper.emit(Events.DB, links[processState.posts]);

  if (processState.posts < links.length - 1) {
    scraper.emit(Events.POSTS, links);
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

  searchTags.map(async (tag) => {
    const searchSite = await fetchSite(`${url}${tag}`);
    const $ = load(searchSite);

    $("body")
      .find("main")
      .find(".title-blob")
      .find("a")
      .each((_, link) => {
        const url = $(link).attr("href");
        allPostLinks.push(url);
      });
  });
  processState.links += 1;
}

// scrapePostingLinks("https://sandiego.craigslist.org");

async function scrapeJob(url) {
  const searchSite = await fetchSite(url);
  const $ = load(searchSite);

  const dataStructure = {
    title: "",
    body: "",
    notices: "",
    time: "",
    compensation: "",
    employmentType: "",
    jobTitle: "",
    postId: "",
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
        dataStructure.compensation = value.split(":")[1]|| "";
      } else if (index === 1) {
        dataStructure.employmentType = value.split(":")[1] || "";
      } else {
        dataStructure.jobTitle = value.split(":")[1] || "";
      }
    });

  async function main() {
    await prisma.job.create({
      data: dataStructure,
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
  
  processState.posts += 1;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
// scrapeJob(
//   "https://sandiego.craigslist.org/csd/sad/d/san-diego-it-technician-tier/7668546553.html"
// );
async function scrapeSiteUrls() {
  const sitesPage = await fetchSite("https://www.craigslist.org/about/sites");
  const $ = load(sitesPage);
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

  scraper.emit(Events.LINKS, sites);
}
