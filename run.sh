#!/bin/bash
# Note : Currently $BASE/funcs/vis_data_bb.json need to be manually filled.
TOPVIZ="$HOME/TopViz"
BASE="$HOME/Topuzz-experiment"
BIN="swftophp-4.8"
EXP_ID=$(date +"%Y%m%d%H%M%S")

# Assume fuzzing is already done
# 0. Get replay result log
cmd="python3 $BASE/scripts/run_replay.py -i $BASE/safe/dafl-Topuzz-avg/$BIN --topuzz -B $BIN-topuzz --test -S >log 2>&1"
echo $cmd
eval $cmd
# 1. Get dug.json and save to safe/sparrow-outs
cmd="$TOPVIZ/run_sparrow_local.sh -b $BIN -i $EXP_ID"
echo $cmd
eval $cmd
# 2. Get compile info & parse it to get additional.json
# Also, formulate dug.json to good format
# Also, merge dug.json for each target, into one file
cmd="python3 $TOPVIZ/get_compile_info.py -b $BIN"
echo $cmd
eval $cmd
# 3. Based on .log, get replay.json
# OUTDIR is , find print("outdir: %s" % outdir) in output of run_replay.py and that is outdir
wait
OUTDIR=$(grep -oP 'outdir: \K.*' log)
echo "outdir: $OUTDIR"
cmd="python3 $BASE/scripts/parse_replay.py -i $BASE/safe/dafl-Topuzz-avg/$BIN -r $OUTDIR/$BIN-topuzz -p 24 -S"
echo $cmd
eval $cmd
# Finally, update websites
cmd="$TOPVIZ/vis_update_websites.sh -i"
echo $cmd
eval $cmd
