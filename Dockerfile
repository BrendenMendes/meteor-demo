FROM node:14
WORKDIR /usr/src/app
#RUN curl https://install.meteor.com/ | sh
#COPY package*.json ./
#RUN meteor npm install
COPY ./output/tasklist/bundle .
ENV ROOT_URL=https://meteor-demo-production.up.railway.app/
ENV MONGO_URL="mongodb+srv://brendenmendes:jIkhSk9jnPSsAR83@justplay.pee7axn.mongodb.net/?retryWrites=true&w=majority"
ENV PORT=3000
RUN chown -R node:node ./
USER node
EXPOSE 3000
CMD node main.js