'use strict';
import * as dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import { executablePath } from 'puppeteer';
import nodemailer from 'nodemailer';

dotenv.config();

const log_space = () => {
  for (let i = 0; i <= 3; i++) {
    console.log(''); // make some space
  }
};

const waitForElementByText = async (page, elementType, text) => {
  return await page.waitForFunction((elType, elText) => {
    const elements = Array.from(document.querySelectorAll(elType));
    return elements.find(element => element.textContent.trim() === elText && element.classList.contains('md-button__children'));
  }, {}, elementType, text);
};

const startPuppeteer = async () => {
  await log_space();
  console.log('==== reassignment started at ' + new Date() + ' ====');

  const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  // open browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',
  });
  const [page] = await browser.pages();
  page.setDefaultNavigationTimeout(150000000); // something extra long for now
  await page.setViewport({ width: 1240, height: 1440 }); // sets page size
  await page.goto(
    `https://admin.webex.com/site/${process.env.ORG_NAME}.webex.com/configure`
  ); // navigates to website

  // login part 1/2
  const loginUserSelector = '#md-input-0';
  await page.waitForSelector(loginUserSelector);
  await page.type(loginUserSelector, process.env.WEBEX_USER); // enter username
  const signInButton = await waitForElementByText(page, 'span', 'Sign In');
  await signInButton.click();

  // login part 2/2
  const loginPassSelector = '#IDToken2';
  await page.waitForSelector(loginPassSelector);
  await page.type(loginPassSelector, process.env.WEBEX_PASS); // enters password
  const loginButtonSelector = '#Button1';
  await page.waitForSelector(loginButtonSelector);
  await page.click(loginButtonSelector); // click login button

  // go to recordings page
  const recordingsSelector = '#RecordingManagement_recording_management';
  await page.waitForSelector(recordingsSelector);
  await page.click(recordingsSelector);

  // recordings page is an iframe so select the iframe and wait for it to load
  const iframeSelector = '#webexiframecontainer';
  await page.waitForSelector(iframeSelector);
  const iframe = await page.$(iframeSelector);
  const frame = await iframe.contentFrame();

  // set date begin and end
  await frame.waitForNavigation();
  await delay(2000);
  const dateBeginSelector = '#input_createdStart';
  await frame.waitForSelector(dateBeginSelector);
  await frame.$eval(dateBeginSelector, (el) => (el.value = '01/01/2021'));
  const dateEndSelector = '#input_createdEnd';
  await frame.waitForSelector(dateEndSelector);
  await frame.$eval(dateEndSelector, (el) => (el.value = '01/01/2025'));
  const searchButtonSelector = 'input.nbr_btn';
  await frame.waitForSelector(searchButtonSelector);
  await frame.click(searchButtonSelector); // click search button

  // select all recordings, a delay is required
  const selectAllRecordings = async () => {
    const selectAllSelector = 'input.selectAll';
    await frame.waitForNavigation();
    await frame.waitForSelector(selectAllSelector).then(async () => {
      delay(4000).then(async () => {
        await frame.$$eval('input[class="selectSub"]', (checks) =>
          checks.forEach((c) => (c.checked = true))
        );
        const reassignButtonSelector = '#btn_reassign';
        await frame.waitForSelector(reassignButtonSelector);
        await frame.click(reassignButtonSelector, { delay: 500 });
      });
    });
  };
  await selectAllRecordings();

  // popup window should open
  browser.on('targetcreated', async (target) => {
    //This block intercepts all new events
    if (target.type() === 'page') {
      // if it tab/page
      const popup = await target.page(); // declare it
      const url = popup.url(); // example, look at her url
      //console.log(url);
      const reassignSearchSelector = '#searchTextId';
      await popup.waitForSelector(reassignSearchSelector);
      await popup.type(reassignSearchSelector, process.env.WEBEX_USER);
      const reassignSearchButtonSelector =
        'body > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(3) > td > font > input.btn.btn-default';
      await popup.click(reassignSearchButtonSelector);
      const reassignUserSelector = 'input[name="user"]';
      await popup.waitForSelector(reassignUserSelector);
      await popup.click(reassignUserSelector);
      const reassignUserOKSelector =
        'body > table > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(2) > td > input.btn.btn-success';
      await popup.waitForSelector(reassignUserOKSelector);
      await popup.click(reassignUserOKSelector);
      // popup closes here
      const confirmReassignSelector = '#nbr_dlg_btn_confirm';
      await frame.waitForSelector(confirmReassignSelector);
      await frame.click(confirmReassignSelector);
    }
  });

  const successReassignSelector = '.nbr_successprompt';
  try {
    for (let pagenum = 1; pagenum <= 22; pagenum++) {
      // don't have a way to know last pagenum
      try {
        await frame.waitForSelector(successReassignSelector).then(async () => {
          await frame.evaluate((page) => {
            showPage(page);
          }, pagenum);
          await selectAllRecordings();
        });
      } catch (err) {
        await send_email(err.toString());
        break;
      }
    }
  } catch (err) {
    //console.log(err);
    await send_email(err.toString());
  }

  // end stuff
  console.log('==== reassignment stopped at ' + new Date() + ' ====');
  await browser.close();
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

try {
  startPuppeteer();
} catch (err) {
  send_email(err.toString());
  console.error(err);
}
