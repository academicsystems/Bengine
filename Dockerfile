FROM alpine
MAINTAINER Academic Systems

# update, upgrade, & install packages

RUN apk update && apk upgrade
RUN apk add coreutils git openssl wget

# npm upgrade to avoid issue: 17858
# also, can't do manual install of latest cause of issue: 18524
# and then there's this other issue with any alpine npm upgrade: 15558
# wtf, no wonder the yarn package manager was invented, had to remove though cause it conflicted with npm
# npm install only works when inlined like this, weird, hacky, sigh
# okay... now this issue requires a downgrade: 19989 ...ugh
RUN apk add nodejs-npm && apk add --update nodejs-npm && npm install npm@5.6.0 -g

# install node and npm

RUN wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.5/install.sh | ash
RUN export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install node; exit 0

# configure bengine

COPY . /var/www
RUN cd /var/www && chmod 744 ./scripts/*.sh && chmod 744 ./tools/*.sh && npm install --unsafe-perm

# add files for running container

COPY assets/ssldomain /var/ssldomain
COPY assets/load /bin/load
RUN chmod 550 /bin/load

CMD ["load"]
