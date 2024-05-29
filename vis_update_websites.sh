#!/bin/bash
# Copy Heatmap, Web Visualizer, and DUG to the web server
# In accordance with the Topuzz experiment
# Copied from $BASE/utils/scripts/vis_update_websites.sh

[ -z "$USER" ] && USER="gun"
[ -z "$BASE" ] && BASE="$HOME/Topuzz-experiment"

HEATMAPS="$BASE/output/replay-dug-json"
SP_OUT="$BASE/safe/sparrow-outs"
DEST="/var/www/html/$USER/dug"

usage() {
  echo "Usage: $(basename $0) [-h] [-v] [-i]"
  echo "Options:"
  echo "  -h  Display this help message"
  echo "  -v  Update visualizer (.js) only"
  echo "  -i  Copy the inst-targ map instead of the replay heatmap"
}

while getopts ":hvi" opt; do
  case ${opt} in
  h)
    usage
    exit 0
    ;;
  v)
    for REPLAYPATH in $(find $DEST -name "replay.json" -type f); do
      rsync -az $HOME/TopViz/visualizer $(dirname $REPLAYPATH)
    done
    exit 0
    ;;
  i)
    HEATMAPS="$BASE/output/inst-targ-as-replay-json/inst-targ"
    DEST="/var/www/html/$USER/dug/inst-targ"
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

mkdir -p $SP_OUT
# rsync -az gun@elvis08.kaist.ac.kr:$SP_OUT/ $SP_OUT

mkdir -p $DEST
rsync -az $HEATMAPS/ $DEST

for REPLAYPATH in $(find $DEST -name "replay.json" -type f); do
  rsync -az ./visualizer/ $(dirname $REPLAYPATH)
done

for DUGPATH in $(find $SP_OUT -maxdepth 2 -name "dug.json" -type f); do
  BIN=$(basename $(dirname $DUGPATH))
  echo "Processing bin: $BIN"
  for REPLAYPATH in $(find "$DEST/$BIN"* -name "replay.json" -type f); do
    DESTPATH=$(dirname $REPLAYPATH)
    if [ -f "$DESTPATH/replay.json" ]; then
      cp $DUGPATH $DESTPATH
      echo "Copied dug.json to: $DESTPATH"
    fi
  done
done

for ADDIPATH in $(find $SP_OUT -name "additional.json" -type f); do
  BIN=$(basename $(dirname $DUGPATH))
  echo "Processing bin: $BIN"
  for REPLAYPATH in $(find "$DEST/$BIN"* -name "replay.json" -type f); do
    DESTPATH=$(dirname $REPLAYPATH)
    if [ -f "$DESTPATH/replay.json" ]; then
      cp $ADDIPATH $DESTPATH
      echo "Copied additional.json to: $DESTPATH"
    fi
  done
done
