'use strict';
import * as dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import { default as path } from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';

dotenv.config();

const downloadPath = path.resolve('/recordings');

puppeteer.use(
  UserPreferencesPlugin({
    userPrefs: {
      download: {
        prompt_for_download: false,
        open_pdf_in_system_reader: true,
        default_directory: downloadPath,
        // automatic_downloads: 1,
      },
      plugins: {
        always_open_pdf_externally: true,
      },
      // disable allow-multiple-downloads popup
      profile: {
        default_content_setting_values: {
          automatic_downloads: 1,
          default_directory: downloadPath,
        },
      },
    },
  })
);

const startPuppeteer = async () => {
  await log_space();
  console.log('==== downloads started at ' + new Date() + ' ====');
  const addLocalJSToPage = async (page) => {
    const fileLocation = new URL('clientsidedownloader.js', import.meta.url);
    const file = fs.readFileSync(fileLocation, 'utf8');
    await page.addScriptTag({ content: file });
  };

  const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  // open browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
  });
  const [page] = await browser.pages();
  page.setDefaultNavigationTimeout(0);
  await page.evaluateOnNewDocument(
    fs.readFileSync('./clientsidedownloader.js', 'utf8')
  );
  await page.setViewport({ width: 1240, height: 1040 }); // sets page size
  await page.goto(
    `https://${process.env.ORG_NAME}.webex.com/webappng/sites/${process.env.ORG_NAME}/recording/home`
  ); // navigates to website
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  // login part 1/2
  const loginUserSelector = '#IDToken1';
  await page.waitForSelector(loginUserSelector);
  await page.type(loginUserSelector, process.env.WEBEX_USER); // enter username
  const submitUserSelector = '#IDButton2';
  await page.waitForSelector(submitUserSelector);
  await page.click(submitUserSelector);

  // login part 2/2
  const loginPassSelector = '#IDToken2';
  await page.waitForSelector(loginPassSelector);
  await page.type(loginPassSelector, process.env.WEBEX_PASS); // enters password
  const loginButtonSelector = '#Button1';
  await page.waitForSelector(loginButtonSelector);
  await page.click(loginButtonSelector); // click login button

  // now to populate the recordings list
  const checkboxSelector = '#all_check_2';
  await page.waitForSelector(checkboxSelector);
  await addLocalJSToPage(page);
  const scrollSectionSelector = '.main';
  await page.waitForSelector(scrollSectionSelector);
  await page.evaluate(async () => {
    const main = document.querySelector('.main');
    for (let i = 1; i <= 100; i++) {
      await delay(200).then(async () => {
        main.scrollTop = 20000000;
        // console.log(i);
      });
    }
  });

  // now building the recordings list
  const recordingList = await page.evaluate(() => {
    const rowList = document
      .querySelector('#recording_list_all')
      .getElementsByTagName('tbody')[0]
      .getElementsByTagName('tr');
    var recordings = [];
    for (let i = 0; i < rowList.length; i++) {
      const row = rowList[i];
      const recordingName = row
        .getElementsByTagName('td')[1]
        .getElementsByTagName('span')[0].innerText;
      const recordingId = row
        .getElementsByTagName('td')[1]
        .getElementsByTagName('a')[0]
        .id.slice(11);
      recordings.push({ recordingName, recordingId });
    }
    return recordings;
  });
  // await console.log(recordingList);

  // now to compare the list with download folder and create a queue for which can be deleted and which needs to be downloaded

  const updateQueues = async () => {
    const deletableRecordings = [];
    const downloadQueue = [];
    const downloadNameQueue = [];

    for await (const recording of recordingList) {
      // TODO could find a universal windows and linux regex for invalid chars and strip them
      const recordingName = recording.recordingName
        .replace(/\//g, '')
        .replace(/  /g, ' ');
      const recordingId = recording.recordingId;
      const filePath = path.join(downloadPath, `${recordingName}.mp4`);
      // console.log(filePath);
      try {
        // console.log(filePath.replace(/'/g, "\\'"));
        if (await fs.existsSync(filePath)) {
          deletableRecordings.push(recordingName);
        } else {
          // console.log(`pushing to download queue recordingId: ${recordingId}`);
          console.log("filepath doesn't exist: ", filePath);
          downloadQueue.push(recordingId);
          downloadNameQueue.push(recordingName);
        }
      } catch (err) {
        console.error(err);
      }
    }

    const queues = [deletableRecordings, downloadQueue, downloadNameQueue];
    return queues;
  };

  const printQueues = (queues) => {
    const [deletableRecordings, downloadQueue, downloadNameQueue] = queues;
    console.log(`${deletableRecordings.length} deletable recordings`);
    console.log('First 3 recordings to delete:');
    for (let i = 0; i < 3; i++) {
      console.log(deletableRecordings[i]);
    }

    console.log(`${downloadQueue.length} recordings to download`);
    console.log('Recordings to download:');
    for (let i = 0; i < downloadNameQueue.length; i++) {
      console.log(downloadNameQueue[i]);
    }
  };

  // now to download the recordings
  const downloadRecording = async (queues) => {
    const [deletableRecordings, downQueue, downloadNameQueue] = queues;
    // console.log(downQueue[0]);

    await page.evaluate((queue) => {
      // console.log(queue[0]);
      queue.forEach((recordingId, i) => {
        if (i <= queue.length) {
          delay(12000 * i - 12000).then(() => {
            const downloadButtonID = `#download_${recordingId}`;
            const downloadButton = document.querySelector(downloadButtonID);
            downloadButton.click();
            const confirmDownloadSelector = '#Dlg_download_confirm';
            const confirmDownload = document.querySelector(
              confirmDownloadSelector
            );
            confirmDownload.click();
          });
        }
      });
      delay(12000 * queue.length).then(() => {
        return 'Downloads finished';
      });
    }, downQueue);
  };

  const finalPrintQueues = (queues) => {
    const [deletableRecordings, downloadQueue, downloadNameQueue] = queues;
    console.log(
      'After processing the download queue size is :' + downloadQueue.length
    );
    // create email if there are failed downloads
    let message = `${downloadNameQueue.length} recordings could not download:
      
`;
    for (const name of downloadNameQueue) {
      message += `${name}`;
    }
    console.log(message);

    if (downloadNameQueue.length > 0) {
      send_email(message);
    }
    console.log('==== downloads stopped at ' + new Date() + ' ====');
  };
  // TODO create and implement delete recordings function

  await updateQueues().then(async (queues) => {
    const [deletableRecordings, downloadQueue, downloadNameQueue] = queues;
    await printQueues(queues);
    await downloadRecording(queues);
    // delay to make sure all recordings are downloaded then do final results and close
    await delay(12000 * downloadQueue.length + 300000).then(async () => {
      log_space();
      console.log('==== finalizing downloads ====');
      await updateQueues().then((queues) => {
        finalPrintQueues(queues);
        browser.close();
      });
    });
  });
};

const log_space = () => {
  for (let i = 0; i <= 3; i++) {
    console.log(''); // make some space
  }
};

const send_email = async (content) => {
  console.log('send_email was triggered');
  let message = {
    from: `${process.env.MAIL_FROM}`,
    to: `${process.env.MAIL_TO}`,
    subject: 'Webex Downloader Error',
    text: content,
  };

  let transporter = nodemailer.createTransport({
    host: `${process.env.SMTP_SERVER}`,
    port: parseInt(`${process.env.SMTP_PORT}`),
    secure: process.env.SMTP_SECURE === 'true',
    ignoreTLS: process.env.SMTP_SECURE === 'false', // have to flip because they use a negative
    ...(process.env.SMTP_USER.length > 0 && {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    }),
  });

  let info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
};

// wrap startPuppeteer in try catch
try {
  startPuppeteer();
} catch (err) {
  send_email(err.toString());
  console.error(err);
}
