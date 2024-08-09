ARG NODE_IMAGE=node:16.13.1-alpine
FROM $NODE_IMAGE AS base

RUN apk add --no-cache make gcc g++ python3 pkgconfig pixman-dev cairo-dev pango-dev libjpeg-turbo-dev
RUN apk add --no-cache cairo pango libjpeg-turbo

ENV PHANTOMJS_VERSION=2.1.1
RUN apk update && apk add --no-cache fontconfig ttf-freefont curl curl-dev && \
  cd /tmp && curl -Ls https://github.com/topseom/phantomized/releases/download/${PHANTOMJS_VERSION}/dockerized-phantomjs.tar.gz | tar xz && \
  cp -R lib lib64 / && \
  cp -R usr/lib/x86_64-linux-gnu /usr/lib && \
  cp -R usr/share /usr/share && \
  cp -R etc/fonts /etc && \
  curl -k -Ls https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-${PHANTOMJS_VERSION}-linux-x86_64.tar.bz2 | tar -jxf - && \
  cp phantomjs-2.1.1-linux-x86_64/bin/phantomjs /usr/local/bin/phantomjs

ENV TZ=Europe/Paris

RUN apk add --update busybox-suid
COPY crontab.txt /etc/cron.d/crontab
RUN chmod 0644 /etc/cron.d/crontab
RUN crontab /etc/cron.d/crontab

RUN apk --no-cache add dumb-init
RUN mkdir -p /home/node/app && chown node:node /home/node/app
WORKDIR /home/node/app
USER node

FROM base AS dependencies
COPY --chown=node:node ./package*.json ./
RUN npm ci
COPY --chown=node:node . .

FROM dependencies AS build
RUN node ace build --ignore-ts-errors --production

FROM base AS production
ENV NODE_ENV=production
ENV PORT=$PORT
ENV HOST=0.0.0.0
ENV APP_KEY=BM8UoKdAoVPiUmn6hV4r2dJWhDpgNKVH
ENV DRIVE_DISK=local
ENV PORT=3000

COPY --chown=node:node ./package*.json ./
#UN npm ci --production
RUN npm install --include=dev

COPY --chown=node:node --from=build /home/node/app/build .
EXPOSE $PORT
#CMD [ "dumb-init", "node", "server.js" ]
CMD ["sh", "-c", "crond && dumb-init node server.js"]

USER root