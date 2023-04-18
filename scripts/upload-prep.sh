#!/bin/bash

# Take source as first argument and output as second
SOURCE=$1;
TARGET=$2;

if [ $# -ne 2 ]; then
    echo "Must run as $0 <source> <target>";
    exit 1;
fi


# Loop through directories and fetch UUIDs
for subject in $SOURCE/*; do
    uuid=`cat $subject/uuid.txt`
    subject_output="$TARGET/$uuid/";

    echo "Processing: $subject - $uuid"

    # create target directory
    mkdir -p $subject_output;

    # copy all jpegs to target
    echo "    Copying Files"
    cp $subject/*.jpg $subject_output

    # create all download zips in target folder
    echo "    Zipping Images"
    find $subject_output -type f -not -name "*.thumb.jpg" | zip -j $subject_output/all.zip -@

    echo "    Ready for Upload"
done