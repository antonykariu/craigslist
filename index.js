import { load } from "cheerio";
import axios from "axios";
import { appendFileSync } from "fs";

async function fetchSite(url) {
  const data = await axios.request({
    method: "GET",
    url,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    },
  });

  return data;
}

async function scrapeSiteUrls() {
  const sitesPage = await fetchSite("https://www.craigslist.org/about/sites");
  const $ = load(sitesPage.data);
  const sites = [];

  // .colmask -> country container
  // .box coloumn
  // ul
  // anchor tags

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
console.log(sites)

// sites.map(async (url) => {
//   // to follow /search/hum
//   const searchSite = await fetchSite(`${url}/search/sof`);
//   const $ = load(searchSite.data);

//   $("body")
//     .find(".posting-title")
//     .each((index, titleLink) => {
//       const link = $(titleLink).attr("href");
//       console.log(link);
//     });

//   // to follow /search/sof
//   // to follow /search/sad
//   // to follow /search/tch
//   // to follow /search/web
//   // to follow /search/cpg
// });

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
