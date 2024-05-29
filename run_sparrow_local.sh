#!/bin/bash
[ -z "$BASE" ] && BASE="$HOME/Topuzz-experiment"
BIN="swftophp-4.7"
METHOD="arithmetic"
EXP_ID=$(date +"%Y%m%d%H%M%S")

usage() {
  echo "Usage: $(basename $0) [-h] [-b BIN] [-m METHOD] [-i EXP_ID]"
  echo "Options:"
  echo "  -h  Display this help message"
  echo "  -b  Target binary (default: $BIN)"
  echo "  -m  Method. Not matters. (default: $METHOD)"
  echo "  -i  EXP_ID. (default: $EXP_ID)"
}

while getopts ":hb:m:i:" opt; do
  case ${opt} in
  h)
    usage
    exit 0
    ;;
  b)
    BIN=$OPTARG
    ;;
  m)
    METHOD=$OPTARG
    ;;
  i)
    EXP_ID=$OPTARG
    ;;
  \?)
    echo "Invalid option: -$OPTARG" >&2
    usage
    exit 1
    ;;
  esac
done

shift $((OPTIND - 1))

if [ "$#" -ne 0 ]; then
  echo "Error: Invalid arguments" >&2
  usage
  exit 1
fi

python3 $BASE/scripts/run_sparrow_local.py $BIN $EXP_ID $METHOD
echo "Saved at $BASE/output/sparrow-outs/$BIN/$EXP_ID"
cp -r $BASE/output/sparrow-outs/$BIN/$EXP_ID/* $BASE/safe/sparrow-outs/$BIN/
echo "Copied to $BASE/safe/sparrow-outs/$BIN"
