FROM node:6.10.3-alpine

WORKDIR /app

COPY package.json .

RUN apk add --no-cache --virtual .build-dependencies git && \
    sed -i -e 's/"mongojs": "0.18.2"/"mongojs": "2.4.0"/g' package.json && \
    yarn install && \
    apk del .build-dependencies

COPY . .

USER node

CMD ["npm", "start"]