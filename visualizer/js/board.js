// Copyright (C) 2023 Prosys Lab, KAIST (https://prosys.kaist.ac.kr)
//
// This program is modified from the original version by the following authors:
// Art, Science, and Engineering of Fuzzing
// Copyright (C) 2019 Sang Kil Cha
//
// This program comes with ABSOLUTELY NO WARRANTY; for details see COPYING.md.
// This is free software, and you are welcome to redistribute it under certain
// conditions; see COPYING.md for details.

"use strict";

// The minimum scale that we can set.
const minScale = 0.2;

// The currently selected node's name.
var currentSelection = undefined;

function replaceRightmostUnderbar(str) {
  const lastIndex = str.lastIndexOf('_');
  if (lastIndex === -1) {
    return str; // No colon found, return the original string
  }
  return str.substring(0, lastIndex) + ':' + str.substring(lastIndex + 1);
}

function calculateRanks(replay) {
  let visitArray = Object.entries(replay["visit"]);
  visitArray.sort((a, b) => b[1] - a[1]);

  let rankMap = {};
  visitArray.forEach((item, index) => {
    rankMap[item[0]] = index + 1;
  });

  return rankMap;
}

function createCanvas() {
  return d3.select("#js-canvas")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
}

function calculateDistancesFromTargets(nodes, targets) {
  let distances = {};
  let queue = [];

  // Initialize distances and queue with target nodes
  for (let target in targets) {
    distances[target] = 0;
    queue.push(target);
  }

  // BFS to calculate distances
  while (queue.length > 0) {
    let current = queue.shift();
    let currentDistance = distances[current];

    for (let key in nodes) {
      let node = nodes[key];
      console.log(node.successors);
      if (node.successors.includes(current.replace(":", "_"))) {
        if (distances[node.bb_line] === undefined) {
          distances[node.bb_line] = currentDistance + 1;
          queue.push(node.bb_line);
        }
      }
    }
  }

  return distances;
}

function parseJSONData(arr, replay, additional) {
  let dict = {};
  var data = {
    "nodes": [],
    "links": []
  };
  let rankMap = calculateRanks(replay);
  $.each(arr["dugraph"]["nodes"], function (_, obj) {
    var node = {
      "bb_line": obj,
      "function": additional[obj]["func"],
      "successors": [],
      "predecessors": [],
      "freq": replay["visit"][obj],
      "rank": rankMap[obj] + " / " + Object.keys(replay["visit"]).length,
      "targets": additional[obj]["belonging targets"],
      "line": additional[obj]["start"] + "-" + additional[obj]["end"],
      "bb_name": additional[obj]["bb"],
    };
    obj = obj.replace(":", "_");
    dict[obj] = node;
    data.nodes.push(node);
  });
  let edges = arr["dugraph"]["edges"];
  $.each(edges, function (_, obj) {
    obj[0] = obj[0].replace(":", "_");
    obj[1] = obj[1].replace(":", "_");
    if (dict[obj[0]]) {
      dict[obj[0]].successors.push(obj[1]);
    } else {
      console.log(`Key not found in dict: ${obj[0]}`);
    }
    if (dict[obj[1]]) {
      dict[obj[1]].predecessors.push(obj[0]);
    } else {
      console.log(`Key not found in dict: ${obj[1]}`);
    }
    data.links.push({
      "source": obj[0],
      "target": obj[1]
    });
  });
  // Calculate distances from targets
  let distances = calculateDistancesFromTargets(dict, replay["targets"]);
  data.nodes.forEach(node => {
    node.distanceFromTarget = distances[node.bb_line] !== undefined ? distances[node.bb_line] : 'N/A';
  });

  return data;
}

function drawEdges(g, d) {
  g.append("defs")
    .selectAll("marker")
    .data(["arrow"])
    .enter().append("marker")
    .attr("id", d => d)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 15)
    .attr("refY", -1.5)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("fill", "#999")
    .attr("d", "M0,-5L10,0L0,5");

  return g.append("g")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .selectAll()
    .data(d.links)
    .join("line")
    .attr("stroke-width", _ => 2)
    .attr("marker-end", _ => `url(${new URL(`#arrow`, location)})`);
}

function buildAuthors(node) {
  let s = "";
  $.each(node.author, function (i, a) {
    if (i == node.author.length - 1 && node.author.length > 1)
      s += ", and " + a;
    else s += ", " + a;
  });
  return s;
}

function buildRef(node) {
  let s = "";
  if (node.title !== undefined) {
    s += "\"" + node.title + "\"";
  } else {
    s += "\"" + node.name + "\"";
  }
  if (node.author !== undefined) {
    s += buildAuthors(node);
  }
  if (node.booktitle !== undefined) {
    s += ". In " + node.booktitle;
  }
  if (node.journal !== undefined) {
    s += ". " + node.journal + ", " + node.volume + "(" + node.number + ")";
  }
  if (node.year !== undefined) {
    s += ", " + node.year;
  }
  return s;
}

function constructIcon(faName, title) {
  return "<i class=\"fa " + faName + "\" title = \"" + title + "\"></i> ";
}

function constructCharSpan(ch, title) {
  return "<i title = \"" + title + "\">" + ch + "</i> ";
}

function appendToolURL(list, node) {
  const item = list.append("li").classed("list-group-item", true);
  item.append("b").text("Tool URL: ");
  if (node.toolurl !== undefined)
    item.append("a")
      .classed("infobox__icon", true)
      .attr("href", node.toolurl)
      .html(constructIcon("fa-wrench", "Tool available"));
  else
    item.append("span").text("Not available.");
}

function appendPredecessors(list, node, nodes, zoom, canvas, width, height) {
  const pred = list.append("li").classed("list-group-item", true);
  pred.append("b").text("Predecessors: ");
  if (node.predecessors !== undefined) {
    $.each(node.predecessors, function (_, name) {
      const matches = nodes.filter(function (n) {
        return n.bb_line.replace(":", "_") === name;
      });
      matches.each(function (d, _) {
        // Check if the distance of the predecessor is less than the current node's distance
        const distance = node.distanceFromTarget;
        const predecessorDistance = d.distanceFromTarget;

        pred.append("button")
          .attr("class", "btn btn-outline-primary")
          .style("background-color", predecessorDistance < distance ? "yellow" : "white") // Highlight in yellow if condition is met
          .text(replaceRightmostUnderbar(name) + "  ")
          .on("click", _ => onClick(d, nodes, zoom, canvas, width, height));
      });
    });
  } else {
    pred.append("span").text("");
  }
}

function appendSuccessors(list, node, nodes, zoom, canvas, width, height) {
  const succ = list.append("li").classed("list-group-item", true);
  succ.append("b").text("Successors: ");
  if (node.successors !== undefined)
    $.each(node.successors, function (_, name) {
      const matches = nodes.filter(function (n) {
        return n.bb_line.replace(":", "_") === name;
      });
      matches.each(function (d, _) {
        // Check if the distance of the successor is less than the current node's distance
        const distance = node.distanceFromTarget;
        const successorDistance = d.distanceFromTarget;
        succ.append("button")
          .attr("class", "btn btn-outline-primary")
          .style("background-color", successorDistance < distance ? "yellow" : "white") // Highlight in yellow if condition is met
          .text(replaceRightmostUnderbar(name) + "  ")
          .on("click", _ => onClick(d, nodes, zoom, canvas, width, height));
      });
    });
  else
    succ.append("span").text("");
}

function appendInfos(list, node) {
  const succ = list.append("li").classed("list-group-item", true);
  const infoContainer = succ.append("div");  // Use a block-level element for line breaks
  infoContainer.append("b").text("Function information: ");
  const ul1 = infoContainer.append("ul");  // Create an unordered list
  // ul1.append("li").text("First found at: Iteration " + String(firstfind));
  ul1.append("li").text("Function name: " + String(node.function));
  ul1.append("li").text("Total visit frequency: " + String(node.freq));
  ul1.append("li").text("Belonging targets: " + String(node["targets"]));
  ul1.append("li").text("Rank: " + String(node.rank)); // Add rank information here
  infoContainer.append("b").text("Basic block information: ");
  const ul2 = infoContainer.append("ul");  // Create an unordered list
  ul2.append("li").text("Line: " + String(node.line));
  ul2.append("li").text("Name in .ll: " + String(node.bb_name));
  ul2.append("li").text("Distance from target: " + String(node.distanceFromTarget)); // Add distance information here

  // infoContainer.append("b").text("Overall fuzzing information: ");
  // const ul2 = infoContainer.append("ul");  // Create an unordered list
  // ul2.append("li").text("Total iterations: " + String(total_iterations));
  // ul2.append("li").text("Bug found at iteration: " + String(found_iteration));
}

function setTitle(node) {
  if (node === undefined) {
    d3.select("#js-infobox-title").text("Select a function");
  } else {
    d3.select("#js-infobox-title")
      .text(node.bb_line);
  }
}

function clearContents() {
  return d3.select("#js-infobox-content").html("");
}

function showInfobox() {
  d3.select("#js-infobox").style("display", "block");
}

function hideInfobox() {
  d3.select("#js-infobox").style("display", "none");
}

function clickNode(node, nodes, zoom, canvas, width, height) {
  let list = clearContents().append("ul").classed("list-group", true);
  appendPredecessors(list, node, nodes, zoom, canvas, width, height);
  appendSuccessors(list, node, nodes, zoom, canvas, width, height);
  appendInfos(list, node);
  // Add the rank information
  const rankInfo = list.append("li").classed("list-group-item", true);
  rankInfo.append("b").text("Node Rank: ");
  rankInfo.append("span").text(node.rank);

  setTitle(node);
  currentSelection = node.bb_line;
  showInfobox();

}

function onClick(node, nodes, zoom, canvas, width, height) {
  const resultList = d3.select("#js-searchform-result");
  // // Change the color of the selected node.
  // nodes.select(".node")
  //   .filter(d => d === node)
  //   .attr("fill", "yellow");
  const k = 2.0;
  const x = -node.x * k + width / 2;
  const y = -node.y * k + height / 2;
  clickNode(node, nodes, zoom, canvas, width, height);
  clearSearchResults(nodes, resultList);
  canvas.transition().duration(750)
    .call(zoom.transform,
      d3.zoomIdentity.translate(x, y).scale(k));
}

function drawNodes(g, d, simulation, zoom, canvas, width, height, targets) {
  const nodes = g.append("g")
    .selectAll("g")
    .data(d.nodes)
    .enter()
    .append("g")

  function dragStart(d) {
    if (!d.active) simulation.alphaTarget(0.3).restart();
    d.subject.fx = d.subject.x;
    d.subject.fy = d.subject.y;
    d.isDragging = true;
  }

  function dragMiddle(d) {
    d.subject.fx = d.x;
    d.subject.fy = d.y;
  }

  function dragEnd(d) {
    if (!d.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    d.isDragging = false;
  }

  nodes.append("ellipse")
    .attr("rx", 70)
    .attr("ry", 12)
    .attr("id", d => d.bb_line)
    .attr("fill", "white")
    .attr("stroke", "grey")
    .attr("stroke-width", 1.5)
    .attr("class", "node")
    .on("click", (_, d) => onClick(d, nodes, zoom, canvas, width, height))
    .call(d3.drag()
      .on("start", dragStart)
      .on("drag", dragMiddle)
      .on("end", dragEnd));

  nodes.append('text')
    .attr("class", "nodetext")
    .attr("dominant-baseline", "central")
    .attr('text-anchor', "middle")
    // currently don't work. need to fix
    .attr("font-size", function (d) { return targets[d.bb_line] ? "16px" : "10px"; })
    .each(function (d) {
      var lines = [d.bb_line];
      if (targets[d.bb_line]) {
        lines.push(targets[d.bb_line]);
      }
      var text = d3.select(this);
      lines.forEach(function (line, i) {
        text.append("tspan")
          .attr("x", 0)
          .attr("dy", i ? "1.2em" : 0) // Adjust the line height
          .text(line);
      });
    })
    .on("click", (_, d) => onClick(d, nodes, zoom, canvas, width, height));

  const dragHandler = d3.drag()
    .on("start", dragStart)
    .on("drag", dragMiddle)
    .on("end", dragEnd);
  dragHandler(nodes);

  return nodes;
}

function drawReplay(replay) {
  const counts = []
  for (var key in replay["visit"]) {
    counts.push(replay["visit"][key])
  }

  // Create a logarithmic color scale
  const min = d3.min(counts);
  const max = d3.max(counts);
  const lb = 1;
  const ub = 10000;
  const diff = ub / lb;
  const colorScale = d3.scaleSequentialLog([lb, ub], d3.interpolateYlOrRd);

  // ---------- LEGEND ----------
  // Add a color reference legend
  const legendWidth = 500;
  const legendHeight = 20;

  const legendScale = d3.scaleSequentialLog()
    .domain(colorScale.domain())
    .range([0, legendWidth]);

  // Create an SVG element
  const svg = d3.select("body")
    .append("svg")
    .attr("width", 1000)  // Set the width of the SVG
    .attr("height", 200);  // Set the height of the SVG

  // Add a linear gradient to the SVG
  const legend = svg.append("defs");
  // Create a logarithmic gradient
  legend.append("linearGradient")
    .attr("id", "legendGradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0).attr("y1", 0)
    .attr("x2", legendWidth).attr("y2", 0)
    .selectAll("stop")
    .data(d3.ticks(0, 1, 10))
    .enter().append("stop")
    .attr("offset", d => d * 100 + "%")
    .attr("stop-color", d => colorScale(lb * Math.pow(diff, d)));

  const xpadding = 50;
  const ypadding = 10;
  svg.append("rect")
    .attr("x", xpadding)
    .attr("y", ypadding)
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#legendGradient)");

  const legendAxis = d3.axisBottom(legendScale).tickValues([1, 10, 100, 1000, 10000, min, max])
    .tickFormat(d => d === min ? "min" : d === max ? "max" : d);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(" + xpadding + "," + (ypadding + legendHeight) + ")")
    .call(legendAxis);

  // Add vertical lines for min and max
  svg.selectAll(".legend-line")
    .data([min, max])
    .enter().append("line")
    .attr("class", "legend-line")
    .attr("x1", d => xpadding + legendScale(d))
    .attr("x2", d => xpadding + legendScale(d))
    .attr("y1", ypadding)
    .attr("y2", ypadding + legendHeight)
    .style("stroke", "black")
    .style("stroke-width", 1);

  svg.append("text")
    .attr("x", xpadding + legendScale(min)) // Adjust x position based on the scale
    .attr("y", ypadding - 5)  // Adjust y position as needed
    .attr("text-anchor", "middle") // Center the text horizontally
    .text("min")
    .attr("font-size", "10px");

  // Add text for "max" above the max tick
  svg.append("text")
    .attr("x", xpadding + legendScale(max)) // Adjust x position based on the scale
    .attr("y", ypadding - 5)  // Adjust y position as needed
    .attr("text-anchor", "middle") // Center the text horizontally
    .text("max")
    .attr("font-size", "10px");

  // ---------- LEGEND END ----------

  // visited node
  for (var key in replay["visit"]) {
    var element = document.getElementById(key);
    d3.select(element).attr("fill", _ => colorScale(replay["visit"][key]));
  }

  // draw all targets (for the program) larger
  Object.keys(replay["targets"]).forEach(function (key) {
    var element = document.getElementById(key);
    d3.select(element)
      .attr("rx", 105)
      .attr("ry", 18)
      .attr("stroke", "#000000")
      .attr("stroke-width", 1.5);
  });

  // // draw the specific target node thicker
  // // TODO: change shape to square
  // var key_change = key.replace(":", "_");
  // d3.select("#" + key_change)
  //   .attr("stroke", "#330000")
  //   .attr("stroke-width", 3);
}

function installZoomHandler(canvas, g) {
  function zoomed(event) {
    g.attr('transform', event.transform);
  }
  const zoomHandler = d3.zoom().on('zoom', zoomed);
  canvas.call(zoomHandler);
  return zoomHandler;
}

function escapeRegExp(string) {
  return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&').replace(/[,]/g, "|");
}

function hideSearchBar(resultList) {
  resultList.html("");
}

function clearSearchResults(nodes, resultList) {
  nodes.select(".node").classed("node-found", function (node) {
    return (currentSelection === node.bb_line);
  });
  hideSearchBar(resultList);
}

function installSearchHandler(width, height, canvas, zoom, nodes) {
  const txt = $("#js-searchform-text");
  const resultList = d3.select("#js-searchform-result");
  let items = null;
  let itemidx = -1;

  function performSearch(s) {
    const escaped = escapeRegExp(s);
    const re = new RegExp(escaped, "i");
    itemidx = -1;
    clearSearchResults(nodes, resultList);
    if (escaped === "") return;
    const matches = nodes.filter(function (n) {
      return n.bb_line.match(re) !== null;
    });
    matches.select(".node").classed("node-found", true);
    const maxShow = 10;
    matches.each(function (d, i) {
      if (i >= maxShow) return;
      resultList.append("li")
        .classed("list-group-item", true)
        .classed("py-1", true)
        .text(d.bb_line)
        .on("click", function () {
          onClick(d, nodes, zoom, canvas, width, height);
        });
    });
  };

  function getCurrentResult() {
    return resultList.selectAll(".list-group-item")
      .classed("active", false).nodes();
  };
  txt.click(function (_) {
    clearSearchResults(nodes, resultList);
  });
  txt.keydown(function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") return false;
    else return true;
  });
  txt.keyup(function (e) {
    if (e.shiftKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" || e.keyCode === 13) {
      if (itemidx >= 0 && itemidx <= items.length - 1) {
        $(items[itemidx]).trigger("click");
        itemidx = -1;
      } else {
        hideSearchBar(resultList);
      }
    } else if (e.key === "ArrowUp" || e.keyCode === 38) {
      items = getCurrentResult();
      itemidx = Math.max(itemidx - 1, 0);
      d3.select(items[itemidx]).classed("active", true);
      return false;
    } else if (e.key === "ArrowDown" || e.keyCode === 40) {
      items = getCurrentResult();
      itemidx = Math.min(itemidx + 1, items.length - 1);
      d3.select(items[itemidx]).classed("active", true);
      return false;
    } else {
      performSearch(txt.val());
    }
  });
}

function installClickHandler() {
  const resultList = d3.select("#js-searchform-result");
  $(document).on("click", "svg", function (_) {
    hideSearchBar(resultList);
  });
}

function installDragHandler() {
  const infobox = d3.select("#js-infobox");
  $("#js-infobox").resizable({
    handles: {
      w: $("#js-separator")
    },
    resize: function (_e, ui) {
      const orig = ui.originalSize.width;
      const now = ui.size.width;
      const width = orig + orig - now;
      infobox.style("flex-basis", width + "px");
      infobox.style("width", null);
      infobox.style("height", null);
    }
  });
}

function installInfoBoxCloseHandler() {
  $("#js-infobox-close").click(function () {
    hideInfobox();
  });
}

function computeYPos(year) {
  return (year - theFirstYear) * yearHeight;
}

function initSimulation(d, simulation, width, height, links, nodes) {
  function ticked() {
    links
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    nodes.attr('transform', d => `translate(${d.x},${d.y})`);
  }

  simulation.nodes(d.nodes)
    .force("link", d3.forceLink(d.links).id(d => d.bb_line.replace(":", "_")))
    .force("charge", d3.forceManyBody().strength(-500).distanceMax(800))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collison", d3.forceCollide().radius(50))
    .on("tick", ticked);
}

function addStatItem(dict, key, id) {
  if (key in dict) dict[key].push(id);
  else dict[key] = [id];
}

function sortByCount(stats) {
  const items = Object.keys(stats).map(function (k) {
    return [k, stats[k]];
  });
  items.sort(function (fst, snd) {
    const sndLen = snd[1].length;
    const fstLen = fst[1].length;
    if (sndLen == fstLen) {
      return fst[0].localeCompare(snd[0]); // lexicographical sorting
    } else {
      return sndLen - fstLen;
    }
  });
  return items;
}

function sortFuzzersByYear(fuzzerMap, fuzzers) {
  fuzzers.sort(function (fst, snd) {
    return fuzzerMap[snd].year - fuzzerMap[fst].year;
  });
  return fuzzers;
}

function makeAccordionElm(handle, myid, header, fuzzers, fnLink) {
  const card = d3.select(handle)
    .append("div").classed("card", true);
  card
    .append("div").classed("card-header", true).attr("role", "tab")
    .append("h6").classed("mb-0", true).classed("small", true)
    .append("div")
    .attr("role", "button")
    .attr("data-toggle", "collapse")
    .attr("data-target", "#" + myid)
    .html(header);
  card
    .append("div").classed("collapse", true).attr("id", myid)
    .append("div").classed("card-body", true)
    .append("h6").classed("small", true)
    .append("ul").classed("list-group", true)
    .selectAll("li")
    .data(fuzzers)
    .enter()
    .append("li").html(function (f) {
      return fnLink(f);
    });
  return $(card.node()).detach();
}

function fuzzerToString(fuzzer) {
  let s = fuzzer.name;
  if (fuzzer.year !== undefined) s += " " + fuzzer.year;
  if (fuzzer.author !== undefined) s += " " + fuzzer.author.join();
  if (fuzzer.title !== undefined) s += " " + fuzzer.title;
  if (fuzzer.booktitle !== undefined) s += " " + fuzzer.booktitle;
  if (fuzzer.targets !== undefined) s += " " + fuzzer.targets.join();
  return s;
}

function makeAnchor(fuzzerMap, f) {
  const fuzzer = fuzzerMap[f];
  return "<a href=\"./?k=" + f + "\">" + buildRef(fuzzer) + "</a>" +
    "<span style=\"display: none\">" +
    fuzzerToString(fuzzerMap[f]) + "</span>";
}

function makeAccordion(fuzzerMap, data, id, handle) {
  const stats = [];
  const sorted = sortByCount(data);
  sorted.forEach(function (data) {
    const name = data[0];
    const fuzzers = data[1];
    const myid = "js-" + id + "-" + name.replace(/\s/g, "");
    const header = name + " (<span>" + fuzzers.length + "</span>)";
    const fnLink = function (f) {
      return makeAnchor(fuzzerMap, f);
    };
    stats.push(
      makeAccordionElm(handle, myid, header,
        sortFuzzersByYear(fuzzerMap, fuzzers), fnLink));
  });
  return stats;
}

function makeVenueAccordion(fuzzerMap, venues) {
  return makeAccordion(fuzzerMap, venues, "venue", "#js-stats-body__venues");
}

function makeTargetAccordion(fuzzerMap, targets) {
  return makeAccordion(fuzzerMap, targets, "target", "#js-stats-body__targets");
}

function makeAuthorAccordion(fuzzerMap, authors) {
  return makeAccordion(fuzzerMap, authors, "author", "#js-stats-body__authors");
}

function filterAndSortAccordion(acc, str, container) {
  const elms = [];
  acc.forEach(function (elm) {
    let matches = 0;
    elm.find("ul > li").each(function () {
      const listElm = $(this);
      const m = listElm.find("span:contains('" + str + "')");
      if (m.length) {
        matches += 1;
        $(this).show();
      }
    });
    if (matches > 0) {
      elms.push([matches, elm]);
      elm.find("div > span").text(matches);
    }
  });
  elms.sort(function (fst, snd) {
    return snd[0] - fst[0];
  });
  elms.forEach(function (elm) {
    container.append(elm[1]);
  });
}

function registerStatsFilter(venueAcc, targetAcc, authorAcc) {
  $("#js-stats-body__filter").on("change keyup paste click", function () {
    const t = $(this).val();
    $(".card li").each(function () {
      $(this).hide();
    });
    $("#js-stats-body__venues").empty();
    $("#js-stats-body__targets").empty();
    $("#js-stats-body__authors").empty();
    filterAndSortAccordion(venueAcc, t, $("#js-stats-body__venues"));
    filterAndSortAccordion(targetAcc, t, $("#js-stats-body__targets"));
    filterAndSortAccordion(authorAcc, t, $("#js-stats-body__authors"));
  });
}

function initStats(data) {
  const fuzzerMap = {};
  const venues = {};
  const targets = {};
  const authors = {};
  data.forEach(function (v) {
    fuzzerMap[v.name] = v;
    if (v.author !== undefined)
      v.author.forEach(function (a) {
        addStatItem(authors, a, v.name);
      });
    if (v.booktitle !== undefined)
      addStatItem(venues, v.booktitle, v.name);
    v.targets.forEach(function (t) {
      addStatItem(targets, t, v.name);
    });
  });
  d3.select("#js-stats-body__summary").append("p")
    .text("Currently, there are a total of " +
      data.length +
      " fuzzers and " +
      Object.keys(authors).length +
      " authors in the DB, collected from " +
      Object.keys(venues).length +
      " different venues.");
  const venueAcc = makeVenueAccordion(fuzzerMap, venues);
  const targetAcc = makeTargetAccordion(fuzzerMap, targets);
  const authorAcc = makeAuthorAccordion(fuzzerMap, authors);
  $.expr[':'].contains = function (n, _, m) {
    return jQuery(n).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0;
  };
  filterAndSortAccordion(venueAcc, "", $("#js-stats-body__venues"));
  filterAndSortAccordion(targetAcc, "", $("#js-stats-body__targets"));
  filterAndSortAccordion(authorAcc, "", $("#js-stats-body__authors"));
  registerStatsFilter(venueAcc, targetAcc, authorAcc);
}

function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1]);
    }
  }
  return undefined;
}

Promise.all([
  d3.json("dug.json"),
  d3.json("replay.json"),
  d3.json("additional.json")
]).then(function ([json, replay, additional]) {
  const width = $("#js-canvas").width();
  const height = $("#js-canvas").height();
  const canvas = createCanvas();
  const simulation = d3.forceSimulation();
  const g = canvas.append("g");
  const d = parseJSONData(json, replay, additional);
  const links = drawEdges(g, d);
  const zoom = installZoomHandler(canvas, g);
  const nodes = drawNodes(g, d, simulation, zoom, canvas, width, height, replay["targets"]);
  drawReplay(replay)
  installSearchHandler(width, height, canvas, zoom, nodes);
  installClickHandler();
  installDragHandler();
  installInfoBoxCloseHandler();
  initSimulation(d, simulation, width, height, links, nodes);
  initStats(d.nodes);
  zoom.scaleTo(canvas, minScale);
  // Center the graph after a sec.
  setTimeout(function () {
    const key = getQueryVariable("k");
    const data = d.nodes.find(function (d) {
      return (d.id === key);
    });
    if (key === undefined || data === undefined) {
      const graphScale = d3.zoomTransform(g.node()).k;
      const y = height / 2 / graphScale;
      zoom.translateTo(canvas, 0, y);
    } else {
      setTimeout(function () {
        onClick(data, nodes, zoom, canvas, width, height);
      }, 1000);
    }
  }, 500);
}).catch(function (error) {
  console.error("Error loading JSON files:", error);
});