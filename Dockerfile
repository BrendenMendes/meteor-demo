FROM node:14
WORKDIR /usr/src/app
COPY ./build/bundle .
WORKDIR /programs/server
CMD ["npm", "i"]
WORKDIR /usr/src/app
ENV ROOT_URL=https://meteor-demo-production.up.railway.app/
ENV MONGO_URL="mongodb+srv://brendenmendes:jIkhSk9jnPSsAR83@justplay.pee7axn.mongodb.net/?retryWrites=true&w=majority"
ENV PORT=3000
RUN chown -R node:node ./
USER node
EXPOSE 3000
CMD node main.js