FROM node:10.14.2-alpine

RUN apk --no-cache update && \
    apk --no-cache upgrade

WORKDIR /app

COPY package.json .

RUN apk add --no-cache --virtual .build-dependencies git && \
    yarn install && \
    yarn cache clean && \
    apk del .build-dependencies

USER node

COPY . .

CMD ["npm", "start"]
