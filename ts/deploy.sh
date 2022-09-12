#!/bin/bash
npm run build
cp -R .elasticbeanstalk build/.elasticbeanstalk
cp -R .platform build/.platform
cp .env build/.env
cd build && eb deploy
