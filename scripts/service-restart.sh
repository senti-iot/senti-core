#!/bin/bash
# chmod 700 api-restart.sh

if [[ "$1" == "master" ]]; then
	npm install --prefix /srv/nodejs/senti/services/core/production
	systemctl restart senti-core.service
	# Senti Slack Workspace
	curl -X POST -H 'Content-type: application/json' --data '{"text":"Senti core MASTER updated and restarted!"}' https://hooks.slack.com/services/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
	echo
	exit 0
fi

if [[ "$1" == "dev" ]]; then
	npm install --prefix /srv/nodejs/senti/services/core/development
	systemctl restart senti-core-dev.service
	# Senti Slack Workspace
	curl -X POST -H 'Content-type: application/json' --data '{"text":"Senti core DEV updated and restarted!"}' https://hooks.slack.com/services/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
	echo
	exit 0
fi

if [[ "$1" == "merge" ]]; then
	npm install --prefix /srv/nodejs/senti/services/core/merge
	systemctl restart senti-core-merge.service
	# Senti Slack Workspace
	curl -X POST -H 'Content-type: application/json' --data '{"text":"Senti core Merge updated and restarted!"}' https://hooks.slack.com/services/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
	echo
	exit 0
fi

exit 0


