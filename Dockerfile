FROM node:10.14.2-alpine as base
WORKDIR /app
RUN apk --no-cache update && \
    apk --no-cache upgrade

FROM base as development
COPY package.json .
RUN apk add --no-cache --virtual .build-dependencies git && \
    sed -i -e 's/"mongojs": "0.18.2"/"mongojs": "2.4.0"/g' package.json && \
    yarn install && \
    yarn cache clean && \
    chown -R node:node /app && \
    apk del .build-dependencies
USER node
COPY --chown=node:node . .
CMD ["npm", "run", "startWatch"]

FROM development as production
CMD ["npm", "start"]
