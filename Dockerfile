FROM node:6.10.3-alpine

RUN apk --no-cache update && \
    apk --no-cache upgrade

WORKDIR /app

COPY package.json .

RUN apk add --no-cache --virtual .build-dependencies git && \
    sed -i -e 's/"mongojs": "0.18.2"/"mongojs": "2.4.0"/g' package.json && \
    yarn install && \
    yarn cache clean && \
    apk del .build-dependencies

USER node

COPY . .

CMD ["npm", "start"]
