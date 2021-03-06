#!/bin/bash

if [[ "$1" == "master" ]]; then
	echo
	echo Deploying Senti core $1 ...
	rsync -r --quiet $2/ deploy@rey.webhouse.net:/srv/nodejs/senti/services/core/production
	echo
	echo Restarting Senti core service: $1 ...
	ssh deploy@rey.webhouse.net 'sudo /srv/nodejs/senti/services/core/production/scripts/service-restart.sh master'
	echo
	echo Deployment to Senti core $1 and restart done!
	exit 0
fi

if [[ "$1" == "dev" ]]; then
	echo
	echo Deploying Senti core $1 ...
	rsync -r --quiet $2/ deploy@rey.webhouse.net:/srv/nodejs/senti/services/core/development
	echo
	echo Restarting Senti core service: $1 ...
	ssh deploy@rey.webhouse.net 'sudo /srv/nodejs/senti/services/core/development/scripts/service-restart.sh dev'
	echo
	echo Deployment to Senti core $1 and restart done!
	exit 0
fi

if [[ "$1" == "merge" ]]; then
	echo
	echo Deploying Senti core $1 ...
	rsync -r --quiet $2/ deploy@rey.webhouse.net:/srv/nodejs/senti/services/core/merge
	echo
	echo Restarting Senti core service: $1 ...
	ssh deploy@rey.webhouse.net 'sudo /srv/nodejs/senti/services/core/merge/scripts/service-restart.sh merge'
	echo
	echo Deployment to Senti core $1 and restart done!
	exit 0
fi