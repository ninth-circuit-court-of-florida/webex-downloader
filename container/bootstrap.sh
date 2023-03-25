#!/bin/bash
mkdir code

cp ../*.js code/
cp ../*.json code/
cp ../*.sh code/

# create a .env file
echo "WEBEX_USER=\"\"" > code/.env
echo "WEBEX_PASS=\"\"" >> code/.env
echo "ORG_NAME=\"\"" >> code/.env
echo "SMTP_SERVER=\"\"" >> code/.env
echo "SMTP_PORT=\"25\"" >> code/.env
echo "SMTP_SECURE=\"true\"" >> code/.env
echo "SMTP_USER=\"\"" >> code/.env
echo "SMTP_PASS=\"\"" >> code/.env
echo "SMTP_TLS=\"true\"" >> code/.env
echo "MAIL_FROM=\"\"" >> code/.env
echo "MAIL_TO=\"\"" >> code/.env

chmod +x build/start.sh
chmod +x code/start.sh
