const fs = require("fs");
const puppeteer = require("puppeteer");
const csv = require("csv-parser");
const async = require("async");

const maxConcurrentScrapers = 5;
const maxPagesPerWebsite = 10;
const timeoutPerPage = 15000;

// function to scrape one website
async function scrapeWebsite(browser, url) {
  const page = await browser.newPage();
  const scrapedData = [];

  try {
    for (let pageCount = 0; pageCount < maxPagesPerWebsite; pageCount++) {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutPerPage,
      });

      // logic to extract phone numbers and social media links with page.evaluate() and DOM manipulation
      const data = await page.evaluate(() => {
        // helper function to extract phone numbers
        function extractPhoneNumbers() {
          const phoneRegex =
            /(\+\d{1,2}\s?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
          const phoneElements = Array.from(
            document.querySelectorAll('[class*="phone"], p, span, a, strong')
          );

          const phoneNumbers = phoneElements
            .map((element) => element.textContent)
            .filter((text) => phoneRegex.test(text))
            .map((text) => text.match(phoneRegex))
            .flat();

          return [...new Set(phoneNumbers)]; // Remove duplicates
        }

        // Helper function to extract social media links
        function extractSocialMediaLinks() {
          const socialMediaElements = Array.from(
            document.querySelectorAll("p, span, a, strong")
          );
          const socialMediaRegex =
            /(facebook|twitter|instagram|linkedin|youtube|share|Share)\.com/i;

          const socialMediaLinks = socialMediaElements
            .map((element) => element.getAttribute("href"))
            .filter((href) => socialMediaRegex.test(href));

          return [...new Set(socialMediaLinks)]; // Remove duplicates
        }

        const phoneNumbers = extractPhoneNumbers();
        const socialMediaLinks = extractSocialMediaLinks();

        return {
          phoneNumbers,
          socialMediaLinks,
        };
      });

      // Check if phoneNumbers and socialMediaLinks array values exist in scrapedData array before pushing data
      const existingPhoneNumbers = scrapedData.map((dataItem) =>
        dataItem.phoneNumbers.toString()
      );
      const dataPhoneNumbers = data.phoneNumbers.toString();

      const existingSocialMediaLinks = scrapedData.map((dataItem) =>
        dataItem.socialMediaLinks.toString()
      );
      const dataSocialMediaLinks = data.socialMediaLinks.toString();

      if (
        !existingPhoneNumbers.includes(dataPhoneNumbers) &&
        !existingSocialMediaLinks.includes(dataSocialMediaLinks)
      ) {
        scrapedData.push(data);
      }

      // Stop after maxPagesPerWebsite pages
      if (pageCount + 1 >= maxPagesPerWebsite) {
        break;
      }
    }
  } catch (error) {
    console.error(`Error scraping ${url}: ${error.message}`);
    return null;
  } finally {
    await page.close();
  }

  console.log("url: ", url, scrapedData);

  return scrapedData;
}

async function startScraping() {
  const websites = [];

  // Read websites from CSV and store in the 'websites' array
  fs.createReadStream("sample-websites.csv")
    .pipe(csv())
    .on("data", (row) => {
      websites.push(`https://${row.domain}`);
    })
    .on("end", async () => {
      console.log(websites);

      const browser = await puppeteer.launch();
      const startTime = new Date(); // Record start time

      const scrapedDataMap = {};

      const queue = async.queue(async (url, callback) => {
        const scrapedData = await scrapeWebsite(browser, url);
        scrapedDataMap[url] = scrapedData;
        console.log(`Scraped data from ${url}`);
        callback();
      }, maxConcurrentScrapers);

      // Add websites to the queue
      queue.push(websites);

      // Wait for all tasks to finish
      queue.drain(async () => {
        const endTime = new Date(); // Record end time
        const totalTimeTaken = (endTime - startTime) / 1000; // Convert to seconds

        await browser.close();
        console.log("Scraping complete");
        console.log(`Total time taken: ${totalTimeTaken} seconds`);

        // Save the scraped data to a JSON file
        fs.writeFileSync(
          "scraped_data.json",
          JSON.stringify(scrapedDataMap, null, 2)
        );
      });
    });
}

startScraping();
