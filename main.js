// Figure 1
function createCoffeeMap(selector) {
    const container = document.querySelector(selector);
    const width = container.clientWidth;
    const height = Math.round(width * 0.65);
    const bounds = [[0, 0], [width, height]];
  
    const svg = d3.select(selector)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "Map of NYC Coffee Shops");
  
    // Background rect for zoom reset
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .on("click", () => {
        overlay.selectAll("*").remove();
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
      });
  
    const g = svg.append("g");
    const overlay = svg.append("g").attr("class", "overlay");
    const tooltip = d3.select("#tooltip");
  
    const colorScale = d3.scaleSequential().interpolator(d3.interpolateViridis).domain([0, 150]);
  
    // Limit zooming
    const zoom = d3.zoom()
      .scaleExtent([1, 15])
      .translateExtent(bounds)
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        overlay.attr("transform", event.transform);
      });
  
    svg.call(zoom);
  
    // Data Loading
    Promise.all([
      d3.json("PreparedData/nyc_nta_2010_coffee.json"),
      d3.xml("images/coffee_person.svg")
    ]).then(([topology, iconData]) => {
      const geojson = topojson.feature(topology, topology.objects.nyc_nta_2010_coffee);
      const padding = 20;
      const projection = d3.geoIdentity()
        .reflectY(true)
        .fitExtent([[padding, padding], [width - padding, height - padding]], geojson);
      const path = d3.geoPath().projection(projection);
  
      // Initial UI Setup
      // Receipt labels for vaiables
      const labels = {
        per_capita: "Coffee Shops Per 10k Residents",
        Total: "Total Coffee Shops",
        AvgScore: "Average Inspection Score",
        A: "% of Coffee Shops with A-Rating"
      };
      let currentVar = "per_capita"; // starting var

      const receipt = setupReceipt(svg, iconData);
  
      function updateLegend(title, scale, svg, width, height) {
        // Remove existing legend
        svg.selectAll(".map-legend").remove();
    
        // Create legend container bottom right
        const legendWidth = 200;
        const legendHeight = 50;
        const xOffset = width - legendWidth - 20; 
        const yOffset = height - legendHeight - 20; 
    
        const legendG = svg.append("g")
            .attr("class", "map-legend")
            .attr("transform", `translate(${xOffset}, ${yOffset})`);
    
        // Background
        legendG.append("rect")
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", "rgba(222, 222, 222, 0.98)")
            .attr("rx", 5);
    
        // Add Title
        legendG.append("text")
            .attr("x", 10)
            .attr("y", 15)
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", "#2d3845")
            .text(title);
    
        // Gradient 
        const [min, max] = scale.domain();
        const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
        
        const linearGradient = defs.append("linearGradient")
            .attr("id", "legend-gradient")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%");
    
        const samples = [0, 0.25, 0.5, 0.75, 1];
        samples.forEach(t => {
            linearGradient.append("stop")
                .attr("offset", `${t * 100}%`)
                .attr("stop-color", scale(min + (max - min) * t));
        });
    
        // Draw Gradient Rect
        legendG.append("rect")
            .attr("x", 10)
            .attr("y", 22)
            .attr("width", legendWidth - 20)
            .attr("height", 10)
            .style("fill", "url(#legend-gradient)")
            .attr("stroke", "#ddd")
            .attr("stroke-width", 0.5);
    
        // Labels (3 probs)
        const labels = [min, (min + max) / 2, max];
        labels.forEach((val, i) => {
            legendG.append("text")
                .attr("x", 10 + (i * (legendWidth - 20) / 2))
                .attr("y", 42)
                .attr("text-anchor", i === 0 ? "start" : i === 1 ? "middle" : "end")
                .style("font-size", "9px")
                .style("font-family", "monospace")
                .style("fill", "#444")
                .text(Math.round(val));
        });
    }
  
    // Updates map and receipt to reflect new variable from dropdown
    function updateMap(variable) {
      const maxVal = d3.max(geojson.features, d => +d.properties[variable] || 0);
      colorScale.domain([0, maxVal]);
  
      g.selectAll(".nta")
          .transition()
          .duration(750)
          .attr("fill", d => {
              const val = +d.properties[variable];
              return (val > 0) ? colorScale(val) : "#efefef";
          });
      
      receipt.updateReceipt(variable, geojson, labels);
  
      updateLegend(labels[variable], colorScale, svg, width, height);
    }

    // Build Dropdown
    const dropdown = setupDropdown((val) => {
        currentVar = val;
        updateMap(val);
      }, labels);

    updateMap("per_capita");
  
      // Draw the map!!! Based on class sample map code
      // Also build out tooltip
      g.selectAll("path")
        .data(geojson.features).enter().append("path")
        .attr("class", "nta")
        .attr("d", path)
        .attr("fill", d => {
          const val = d.properties.per_capita;
          return (val !== undefined) ? colorScale(val) : "#efefef";
        })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.5)
        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget).attr("stroke-width", 1.5).attr("stroke", "#997574").raise();
            const val = d.properties[currentVar];
            
            // There are def some null values
            let displayVal = "N/A"; 
            
            if (val !== null && val !== undefined && !isNaN(val)) {
              if (currentVar === "A") {
                displayVal = val.toFixed(1) + "%";
              } else if (currentVar === "per_capita" || currentVar === "AvgScore") {
                displayVal = val.toFixed(2);
              } else {
                displayVal = Math.round(val);
              }
            }
          
            tooltip.style("display", "block")
              .html(`<strong>${d.properties.NTAName}</strong><br/>${labels[currentVar]}: ${displayVal}`)
              .style("opacity", 1);
          })
        .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 10) + "px").style("top", (event.pageY - window.scrollY - 10) + "px");
        })
        .on("mouseout", (event) => {
          d3.select(event.currentTarget).attr("stroke-width", 0.5).attr("stroke", "#fff");
          tooltip.style("display", "none").style("opacity", 0);
        })
        .on("click", (event, d) => {
          // On click, show the individial shops in a neighborhood
          // Extension idea: grey out the other neighborhoods
          const bounds = path.bounds(d);
          const dx = bounds[1][0] - bounds[0][0], dy = bounds[1][1] - bounds[0][1];
          const x = (bounds[0][0] + bounds[1][0]) / 2, y = (bounds[0][1] + bounds[1][1]) / 2;
          const scale = Math.min(8, 0.9 / Math.max(dx / width, dy / height));
          const translate = [width / 2 - scale * x, height / 2 - scale * y];
  
          svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
          loadShopMap(d, projection, overlay, tooltip);
        });
  
      updateMap("per_capita");
    });
  }
  
  // Deals with loading the individual shop points
  function loadShopMap(feature, projection, overlay, tooltip) {
    overlay.selectAll("*").remove();
  
    d3.json("PreparedData/nyc_coffee_points.json").then(topo => {
      const points = topojson.feature(topo, topo.objects.nyc_coffee_points).features;
      
      // Filter points for the selected neighborhood
      const pointsInNeighbourhood = points.filter(point =>
        point.properties.NTA === feature.properties.NTACode);
  
      overlay.selectAll("circle")
        .data(pointsInNeighbourhood)
        .enter()
        .append("circle")
        .attr("cx", d => projection(d.geometry.coordinates)[0])
        .attr("cy", d => projection(d.geometry.coordinates)[1])
        .attr("r", 0.8)
        .attr("fill", d => {
          const g = d.properties.GRADE;
          // Use the dictionary we talked about
          const colors = {
              "A": "#2ecc71", // Green
              "B": "#f1c40f", // Yellow
              "C": "#e74c3c"  // Red
          };
          return colors[g] || "#999"; // Grey if grade is missing/other
      })
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.2)
        .on("mouseover", (event, d) => {
          // Points Tooltip
          tooltip.style("display", "block")
            .style("opacity", 1)
            .html(`
              <strong>${d.properties.DBA}</strong><br>
              Grade: ${d.properties.GRADE}<br>
              Score: ${d.properties.SCORE}
            `);
        })
        .on("mousemove", (event) => {
          // Consistent with neighborhood tooltip! important
          tooltip.style("left", (event.pageX + 10) + "px")
                 .style("top", (event.pageY - window.scrollY - 10) + "px");
        })
        .on("mouseout", () => {
          tooltip.style("display", "none")
                 .style("opacity", 0);
        });
    }).catch(err => console.error("Error loading points:", err));
  }
  
  // Build the receipt!
  function setupReceipt(svg, iconData) {
    const receiptGroup = svg.append("g").attr("class", "receipt");
    receiptGroup.append("rect").attr("class", "receipt")
      .attr("x", 30).attr("y", 30).attr("width", 200).attr("height", 350);

    const header = receiptGroup.append("g").attr("class", "receipt-header");
    const content = receiptGroup.append("g").attr("class", "receipt-content");
  
    header.append("text").attr("x", 75).attr("y", 70).attr("text-anchor", "middle").style("font-weight", "bold").style("font-size", "14px").style("fill", "#2d3845").text("COFFEE");
    header.append("text").attr("x", 175).attr("y", 70).attr("text-anchor", "middle").style("font-weight", "bold").style("font-size", "14px").style("fill", "#2d3845").text("CITY");
    
    const imported = header.node().appendChild(iconData.documentElement);
    d3.select(imported).attr("width", 50).attr("height", 50).attr("x", 100).attr("y", 40);
  
    // Static Information
    header.append("text").attr("x", 40).attr("y", 100).style("fill", "#2d3845").style("font-size", "10px").text("------------------------------");
    header.append("text").attr("x", 40).attr("y", 120).style("fill", "#2d3845").style("font-size", "10px").text("------------------------------");
    header.append("text").attr("x", 40).attr("y", 135).style("fill", "#2d3845").style("font-size", "10px").text("Top 5 Neighborhoods:");
    header.append("text").attr("x", 40).attr("y", 220).style("fill", "#2d3845").style("font-size", "10px").text("Bottom 5 Neighborhoods:");
    header.append("text").attr("x", 40).attr("y", 355).style("fill", "#2d3845").style("font-size", "10px").text("------------------------------");
    header.append("text").attr("x", 36).attr("y", 325).style("fill", "#2d3845").style("font-size", "10px").text("Click on a neighboorhood to see");
    header.append("text").attr("x", 100).attr("y", 340).style("fill", "#2d3845").style("font-size", "10px").text("the shops!");
    header.append("text").attr("x", 90).attr("y", 370).style("fill", "#2d3845").style("font-size", "14px").style("font-weight", "bold").text("THANK YOU");
  
    return {
        updateReceipt: (variable, geojson, labels) => {
          content.selectAll(".dynamic-text").remove();
      
          const rankMap = {
            "per_capita": "rank_capita",
            "Total": "rank_Total",
            "AvgScore": "rank_AvgScore",
            "A": "rank_A"
          };
      
          const rankCol = rankMap[variable];
          if (!rankCol) return;

          if (variable == "AvgScore") {
            content.append("text")
              .attr("class", "dynamic-text")
              .attr("x", 48).attr("y", 305)
              .style("fill", "#2d3845")
              .style("font-size", "10px")
              .text("[A: 0-13, B: 14-27, C: 28+]");
          }
      
          // Title
          content.append("text")
            .attr("class", "dynamic-text")
            .attr("x", 40).attr("y", 110)
            .style("fill", "#2d3845").style("font-size", "10px").style("font-weight", "bold")
            .text(labels[variable]);
      
          // Helper to format the value based on the variable
          const formatVal = (v) => {
            if (v === null || v === undefined || isNaN(v)) return "N/A";
            if (variable === "A") return v.toFixed(1) + "%";
            if (variable === "Total") return Math.round(v).toString();
            return v.toFixed(1);
          };
      
          // Get Top 5 (already ranked in R)
          const top5 = geojson.features
            .filter(d => !isNaN(+d.properties[rankCol]) && +d.properties[rankCol] > 0)
            .sort((a, b) => +a.properties[rankCol] - +b.properties[rankCol])
            .slice(0, 5);
      
          // Bottom 5
          const bottom5 = geojson.features
            .filter(d => !isNaN(+d.properties[rankCol]) && +d.properties[rankCol] > 0)
            .sort((a, b) => +b.properties[rankCol] - +a.properties[rankCol])
            .slice(0, 5);
      
          // Draw Top 5
          top5.forEach((d, i) => {
            const rank = Math.round(d.properties[rankCol]);
            const val = formatVal(d.properties[variable]);
            
            // Truncate name to 10 chars max
            let name = d.properties.NTAName || "Unknown";
            if (name.length > 20) name = name.substring(0, 20);
          
            // Create the left part (Rank + Name)
            const leftPart = `${rank}. ${name}`;
            
            // Combine with dots to reach specific len
            const fullLine = leftPart.padEnd(33 - val.length, ".") + val;
          
            content.append("text")
              .attr("class", "dynamic-text")
              .attr("x", 40).attr("y", 153 + (i * 12))
              .style("fill", "#2d3845")
              .style("font-size", "9px")
              .style("font-family", "monospace") // <- monospace to ensure same len
              .text(fullLine);
          });
      
          // Draw Bottom 5 (same as top 5 but drawn in reverse)
          bottom5.forEach((d, i) => {
            const rank = Math.round(d.properties[rankCol]);
            const val = formatVal(d.properties[variable]);

            let name = d.properties.NTAName || "Unknown";
            if (name.length > 20) name = name.substring(0, 20);
          
            const leftPart = `${rank}. ${name}`;
  
            const fullLine = leftPart.padEnd(33 - val.length, ".") + val;
          
            content.append("text")
              .attr("class", "dynamic-text")
              .attr("x", 40).attr("y", 285 - (i * 12))
              .style("fill", "#2d3845")
              .style("font-size", "9px")
              .style("font-family", "monospace") 
              .text(fullLine);
          });
        }
      };
  }
  
  // Build the dropdown to control the var
  function setupDropdown(onChange, labels) {
    const options = Object.entries(labels).map(([k, v]) => ({ value: k, label: v }));

    d3.select(".controls").remove();

    const controls = d3.select(".wrap")
        .insert("div", "#map")
        .attr("class", "controls")
        .style("margin", "10px")
        .style("position", "relative")
        .style("z-index", "10"); // Don't think i need this but ordering is weird sometimes

    controls.append("label")
        .attr("for", "variable-select")
        .style("font-family", "Radio Canada")
        .text("Analyze by: ");
    
    const dropdown = controls.append("select")
        .attr("id", "variable-select")
        .style("background-color", "rgba(207, 192, 192, 0.6)")
        .style("border-radius", "5px")
        .style("border", "none")
        .style("font-family", "Radio Canada")
        .style("padding", "2px")
        .style("margin-left", "2px")
        .on("change", function(event) {
            const selectedValue = d3.select(this).property("value");
            onChange(selectedValue);
        });

    dropdown.selectAll("option")
        .data(options)
        .enter()
        .append("option")
        .attr("value", d => d.value)
        .text(d => d.label);

    return dropdown;
}

// Buttons to switch between figures
d3.select(".left-button").on("click", function() {
  // Show clicked
  d3.selectAll(".left-button, .right-button")
    .style("font-weight", "normal")
    .style("background-color", "transparent");
  
  d3.select(this)
    .style("font-weight", "bold")
    .style("background-color", "rgb(207, 192, 192)");

  // Make fig 1!
  d3.select("#map").selectAll("*").remove(); 
  d3.select(".controls").remove(); 
  createCoffeeMap("#map");
});

d3.select(".right-button").on("click", function() {
  d3.selectAll(".left-button, .right-button")
    .style("font-weight", "normal")
    .style("background-color", "transparent");
  
  d3.select(this)
    .style("font-weight", "bold")
    .style("background-color", "rgb(207, 192, 192)");

  // Clear prev fig
  d3.select("#map").selectAll("*").remove();
  d3.select(".controls").remove();
  
  // placeholder
  d3.select("#map").append("div")
    .style("padding", "20px")
    .text("Right Button Content Goes Here...");
});