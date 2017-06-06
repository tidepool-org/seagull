FROM node:6.10.3-alpine

# Common ENV
ENV API_SECRET="This is a local API secret for everyone. BsscSHqSHiwrBMJsEGqbvXiuIUPAjQXU" \
    SERVER_SECRET="This needs to be the same secret everywhere. YaHut75NsK1f9UKUXuWqxNN0RUwHFBCy" \
    LONGTERM_KEY="abcdefghijklmnopqrstuvwxyz" \
    DISCOVERY_HOST=hakken:8000 \
    PUBLISH_HOST=hakken \
    METRICS_SERVICE="{ \"type\": \"static\", \"hosts\": [{ \"protocol\": \"http\", \"host\": \"highwater:9191\" }] }" \
    USER_API_SERVICE="{ \"type\": \"static\", \"hosts\": [{ \"protocol\": \"http\", \"host\": \"shoreline:9107\" }] }" \
    SEAGULL_SERVICE="{ \"type\": \"static\", \"hosts\": [{ \"protocol\": \"http\", \"host\": \"seagull:9120\" }] }" \
    GATEKEEPER_SERVICE="{ \"type\": \"static\", \"hosts\": [{ \"protocol\": \"http\", \"host\": \"gatekeeper:9123\" }] }" \
# Container specific ENV
    PORT=9120 \
    SERVICE_NAME=seagull-local \
    SALT_DEPLOY=KEWRWBe5yyMnW4SxosfZ2EkbZHkyqJ5f \
    MONGO_CONNECTION_STRING="mongodb://mongo/seagull"

WORKDIR /app

COPY package.json /app/package.json
RUN apk --no-cache add git \
# Update mongojs so that we can run seagull using node 6+
 && sed -i -e 's/"mongojs": "0.18.2"/"mongojs": "2.4.0"/g' package.json \
 && yarn install \
 && apk del git
COPY . /app

USER node

CMD ["npm", "start"]
