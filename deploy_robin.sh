#!/bin/bash
chmod 777 build/ -R
npm run build
cp -R .elasticbeanstalk build/.elasticbeanstalk
cp -R .platform build/.platform
cp .env build/.env
cd build
git init
git config user.email "robin@diggersfactory.com"
git config user.name "Robin Souriau"
git add .
git commit -m 'Robin deploy'
eb deploy DiggersfactoryApi-prod
