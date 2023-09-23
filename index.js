import { load } from "cheerio";
import axios from "axios";
import { appendFileSync } from "fs";

async function performScraping() {
  // downloading the target web page
  // by performing an HTTP GET request in Axios
  const axiosResponse = await axios.request({
    method: "GET",
    url: "https://www.craigslist.org/about/sites",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    },
  });

  const $ = load(axiosResponse.data);

  // initializing the data structures
  // that will contain the scraped data
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
                  console.log(urls);

                });
            });
        });
    });

  console.log(sites);
}

performScraping();
