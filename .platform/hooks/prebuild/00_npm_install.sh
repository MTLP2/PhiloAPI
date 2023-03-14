#!/bin/bash
cd /var/app/staging
sudo -u webapp npm install --no-package-lock canvas sharp
sudo -u webapp npm install