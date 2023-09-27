import { load } from "cheerio";
import puppeteer from "puppeteer";

async function fetchSite(url) {
  const browser = await puppeteer.launch({
    headless: "old",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/google-chrome'
  });

  const page = await browser.newPage();
  await page.goto(url);

  const html = await page.content();
  return html
}

async function scrapeSiteUrls() {
  const sitesPage = await fetchSite("https://www.craigslist.org/about/sites");
  const $ = load(sitesPage.data);
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

  return sites;
}

const sites = await scrapeSiteUrls();
console.log(sites);

// async function scrapeHumanResource(url) {
//   const searchSite = await fetchSite(url);

//   const $ = load(searchSite.data);

//   const value = $("body").text();

//   console.log(value);

//   // to follow /search/sof
//   // to follow /search/sad
//   // to follow /search/tch
//   // to follow /search/web
//   // to follow /search/cpg
//   // $("body")
//   //   .find(".posting-title")
//   //   .each((index, titleLink) => {
//   //     const link = $(titleLink).attr("href");
//   //     console.log(link);
//   //   });
// }

// scrapeHumanResource("https://sandiego.craigslist.org/search/hum");

// for each site append search to url to follow e.g sandiego.craiglist.org/search/hum for human resource

// 714 urls to follow
// areas of interest
// Jobs -> software / qa / dba
//      -> web info design
//      -> technical support
//      -> Systems / networking
//      -> human resource
// Gigs -> computer

// TODO! the grub every link in view and follow
// TODO? grub Title, subheading, body, posted date, post id, compensation, employment type
