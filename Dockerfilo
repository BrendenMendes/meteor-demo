FROM node:14
WORKDIR /usr/src/app
RUN curl https://install.meteor.com/ | sh
COPY package*.json ./
RUN meteor npm install
COPY . .
RUN chown -R node:node ./
USER node
EXPOSE 3000
CMD meteor