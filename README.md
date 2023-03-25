# Webex Recording Downloader

Webex Recording Downloader is a simple tool that automates the process of downloading Webex recordings using Puppeteer. This project is provided as-is, and you are welcome to use and modify it according to your needs.

## Prerequisites
Docker and Docker Compose

Examples:
- https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-22-04
- https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-compose-on-ubuntu-22-04

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ninth-circuit-court-of-florida/webex-downloader.git
```

2. Bootstrap the container
```bash
cd webex-downloader
cd container
chmod +x bootstrap.sh
./bootstrap.sh
```

3. Edit the .env file inside container/code appropriately or include env variables in your compose file

4. Edit the docker-compose.yml for your recordings download location.

5. Build the image and run it and check the logs
```bash
docker compose build
docker compose up -d
docker compose logs --follow
```
