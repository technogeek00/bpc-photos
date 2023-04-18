#!/bin/bash

# Take source as first argument
ENDPOINT=$1;
TOKEN=$2;
TARGET=$3;

# duration will be defaulted to one month (60 * 60 * 24 * 30)
DURATION=2592000

if [ $# -ne 3 ]; then
    echo "Must run as $0 <token-endpoint> <generation-token> <target>";
    exit 1;
fi

# set token file
TOKENS=$TARGET/tokens.csv
# clear previous tokens
rm $TOKENS

# Directory names are targets
for subject in $TARGET/*; do
    uuid=`basename $subject`;

    echo "Fetching $uuid";
    token=`curl -s --header "Content-Type: application/json" \
        --request POST \
        --data "{\"token\": \"$TOKEN\", \"subject\": \"$uuid\", \"duration\": $DURATION }" \
        $ENDPOINT | jq -r '.token'`
    echo "$uuid, $token" >> $TOKENS
done
