#!/bin/sh
set -e
: "${API_BASE_URL:=http://app:3000}"

envsubst '${API_BASE_URL}' < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js
exec nginx -g 'daemon off;'
