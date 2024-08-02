ARG NODE_IMAGE=node:16.13.1-alpine

FROM $NODE_IMAGE AS base
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
RUN npm ci --production
COPY --chown=node:node --from=build /home/node/app/build .
EXPOSE $PORT
#CMD [ "dumb-init", "node", "server.js" ]
CMD ["sh", "-c", "crond && dumb-init node server.js"]

USER root