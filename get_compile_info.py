import argparse
import os
import json
from common import run_cmd, run_cmd_in_docker

BASE_DIR = "/home/gun/Topuzz-experiment"
print("Check if it is you:", BASE_DIR)
TAG = "vis"
IMAGE_NAME = f"topuzz-artifact:{TAG}"
PRINT_DEBUG = False
def print_dbg(msg):
    """Print only at debug mode"""
    if PRINT_DEBUG:
        print(msg)

def setup_DAFL_logger(container):
    cmd = "ls /fuzzer/DAFL_logger"
    if ("No such file or directory" in run_cmd_in_docker(container, cmd, True)):
        # COPY DAFL_logger /fuzzer/DAFL_logger
        # COPY docker-setup/setup_DAFL_logger.sh /fuzzer/setup_DAFL_logger.sh
        # RUN ./setup_DAFL_logger.sh
        # COPY docker-setup/target/logger /benchmark/target/logger
        cmd = f"docker cp {BASE_DIR}/docker-setup/DAFL_logger {container}:/fuzzer/DAFL_logger"
        cmd += f" && docker cp {BASE_DIR}/docker-setup/setup_DAFL_logger.sh {container}:/fuzzer/setup_DAFL_logger.sh"
        cmd += f" && docker exec {container} /bin/bash -c '/fuzzer/setup_DAFL_logger.sh'"
        cmd += f" && docker cp {BASE_DIR}/docker-setup/target/logger {container}:/benchmark/target/logger"
        run_cmd_in_docker(container, cmd, True)
    else:
        print("DAFL_logger exists")

def build_binary(container, bin):
    cmd = f"ls benchmark/bin/Topuzz-logger/{bin}"
    if ("No such file or directory" in run_cmd_in_docker(container, cmd, True)):
        # COPY docker-setup/build_bench_Topuzz_logger.sh /benchmark/build_bench_Topuzz_logger.sh
        # RUN ./build_bench_Topuzz_logger.sh
        cmd = f"python3 {BASE_DIR}/scripts/make_build_bench_scripts.py -b {bin} --tool Topuzz_logger -S"
        cmd += f" && docker cp {BASE_DIR}/docker-setup/build_bench_Topuzz_logger.sh {container}:/benchmark/build_bench_Topuzz_logger.sh"
        cmd += f" && docker exec {container} /bin/bash -c '/benchmark/build_bench_Topuzz_logger.sh'"
        run_cmd_in_docker(container, cmd, True)
    else:
        print("binary exists")

def main():
    parser = argparse.ArgumentParser(description='Run the experiments.')
    parser.add_argument('-S', '--silent', action='store_true', help='Skip checking the image name')
    parser.add_argument('-N', '--name', type=str, default='vis', help='Image tag name (Default = vis)')
    parser.add_argument('-b', '--bin', type=str, default='swftophp-4.7', help='Specify the binary (eg_ swftophp-4.7)')
    parser.add_argument('--debug', action='store_true', help='Print debug messages')
    args = parser.parse_args()
    global PRINT_DEBUG
    PRINT_DEBUG = args.debug
### Phase 1. Get .txt file by compiling
    IMAGE_NAME = "topuzz-artifact:%s" % args.name
    container = "get_compile_info_Topuzz_logger"
    cmd = f"docker run --privileged --rm -it -d -m=4g --name {container} {IMAGE_NAME}"
    run_cmd(cmd)
    # In docker, check if /fuzzer/DAFL_logger exists
    setup_DAFL_logger(container)
    build_binary(container, args.bin)
    cmd = f"docker cp {container}:/benchmark/build_log/Topuzz_logger-{args.bin}-topuzz.txt {BASE_DIR}/output/sparrow-outs/"
    run_cmd(cmd)
    cmd = f"docker kill {container}"
    run_cmd(cmd)
### Phase 2. Parse it to get additional.json
    # Step 1: Read the log file
    log_file_path = f"{BASE_DIR}/output/sparrow-outs/Topuzz_logger-{args.bin}-topuzz.txt"
    # Step 2: Extract relevant log entries
    # Each relevant log entry is prefixed by [FUNC|BLOCK|LINES] and follows the pattern:
    # bufferBranchTarget|entry|assembler.c:76-78
    # We need to extract the function, basic block (bb), filename, and line range from each entry.
    additional_dict = {}
    with open(log_file_path, 'r') as file:
        for line in file:
            if '[FUNC|BLOCK|LINES]' in line:
                parts = line.split('[FUNC|BLOCK|LINES]', 1)[1].split('|')
                func = parts[0]
                bb = parts[1]
                filename, line_range = parts[2].split(':')
                start_line, end_line = line_range.split('-')

                # Step 3: Construct a dictionary for JSON output
                # Use filename:startline as the key and store func, bb, start, and end as a dictionary.
                key = f"{filename}:{start_line}"
                value = {'func': func.strip(), 'bb': bb.strip(), 'start': start_line.strip(), 'end': end_line.strip(), 'belonging targets': []}
                additional_dict[key] = value

    # Step 4: Read and merge dug.json files
    # dug.json files are located in BASE/safe/sparrow-outs/args.bin/ and contain graph data.
    # We need to merge these files into one comprehensive graph, adjusting nodes to reflect the first line of code per block.
    dug_directory = f"{BASE_DIR}/safe/sparrow-outs/{args.bin}"
    merged_graph = {'dugraph': {'nodes': [], 'edges': []}}

    for base_dir, _, files in os.walk(dug_directory):
        print_dbg("dug_directory: %s" % dug_directory)
        print_dbg("base_dir: %s" % base_dir)
        if 'dug.json' in files:
            # Extract directory name
            target = os.path.basename(base_dir)
            dug_file = os.path.join(base_dir, 'dug.json')
            with open(os.path.join(dug_directory, dug_file), 'r') as file:
                dug_data = json.load(file)
                print_dbg("Load dug data from %s" % dug_file)
                # Process nodes and edges, adjust node names using the additional_dict
                for node in dug_data['dugraph']['nodes']:
                    filename, line_no = node.split(':')
                    for key, details in additional_dict.items():
                        if filename == key.split(':')[0] and int(details['start']) <= int(line_no) <= int(details['end']):
                            new_node = f"{filename}:{details['start']}"
                            if target not in additional_dict[key]['belonging targets']:
                                additional_dict[key]['belonging targets'].append(target)
                                if target == "2016-9829":
                                    print(filename, line_no, details['start'], details['end'], target, additional_dict[key]['belonging targets'])
                            if new_node not in merged_graph['dugraph']['nodes']:
                                merged_graph['dugraph']['nodes'].append(new_node)
                            break
                for edge in dug_data['dugraph']['edges']:
                    src = edge[0]
                    dst = edge[1]
                    src_filename, src_line_no = src.split(':')
                    dst_filename, dst_line_no = dst.split(':')
                    for key, details in additional_dict.items():
                        if src_filename == key.split(':')[0] and int(details['start']) <= int(src_line_no) <= int(details['end']):
                            src = f"{src_filename}:{details['start']}"
                        if dst_filename == key.split(':')[0] and int(details['start']) <= int(dst_line_no) <= int(details['end']):
                            dst = f"{dst_filename}:{details['start']}"
                    new_edge = [src, dst]
                    if new_edge not in merged_graph['dugraph']['edges']:
                        merged_graph['dugraph']['edges'].append(new_edge)
                merged_graph['dugraph']['edges'].extend(dug_data['dugraph']['edges'])

    # Step 5: Write the additional data dictionary to additional.json
    # This will store mapping information that correlates nodes with their corresponding function and basic block.
    additional_file_path = f"{BASE_DIR}/output/sparrow-outs/{args.bin}/additional.json"
    with open(additional_file_path, 'w') as file:
        json.dump(additional_dict, file)
        print(f"Additional data written to {additional_file_path}")
    cmd=f"cp {additional_file_path} {BASE_DIR}/safe/sparrow-outs/{args.bin}/additional.json"
    run_cmd(cmd)

    # Save the merged dugraph back to the directory.
    merged_dug_path = f"{BASE_DIR}/output/sparrow-outs/{args.bin}/dug.json"
    with open(merged_dug_path, 'w') as file:
        json.dump(merged_graph, file)
        print(f"Merged graph written to {merged_dug_path}")
    cmd=f"cp {merged_dug_path} {BASE_DIR}/safe/sparrow-outs/{args.bin}/dug.json"
    run_cmd(cmd)

if __name__ == "__main__":
    main()
