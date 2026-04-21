(function () {

  var width = 960, height = 580;

  var svg = d3.select('#origins-map')
    .attr('width', width)
    .attr('height', height);

  var projection = d3.geoAlbersUsa().scale(1280).translate([480, 300]);
  var path = d3.geoPath(projection);

  var tooltip = document.getElementById('tooltip');

  // URL params
  var urlParams  = new URLSearchParams(window.location.search);
  var paramState = urlParams.get('state') || '';
  var paramFrom  = urlParams.get('from') || '';

  // Context banner
  if (paramFrom) {
    var banner = document.getElementById('context-banner');
    if (banner) {
      var fromLabels = { mos: 'MOS Explorer', destinations: 'Veteran Destinations' };
      banner.style.display = 'block';
      banner.innerHTML = 'Exploring from <strong>' + (fromLabels[paramFrom] || paramFrom) + '</strong>'
        + (paramState ? ' &mdash; highlighted: <strong>' + paramState + '</strong>' : '');
    }
  }

  Promise.all([
    d3.json('./assets/states-10m.json'),
    d3.json('./data/recruit_origins_state.json')
  ]).then(function (results) {

    var topo    = results[0];
    var origins = results[1];

    var states = topojson.feature(topo, topo.objects.states);

    var dataByName = {};
    origins.forEach(function (d) { dataByName[d.state] = d; });

    // Update top over-represented stat
    var topRatio = origins.slice().sort(function (a, b) {
      return b.army_ratio - a.army_ratio;
    })[0];
    document.getElementById('top-ratio-state').textContent = topRatio.state;
    document.getElementById('top-ratio-val').textContent =
      'Ratio: ' + topRatio.army_ratio.toFixed(2) + 'x vs. population share';

    var colorMode = document.getElementById('color-mode');

    function getColorScale(mode) {
      if (mode === 'accessions') {
        var vals = origins.map(function (d) { return d.army_accessions; });
        return d3.scaleSequential()
          .domain([0, d3.max(vals)])
          .interpolator(d3.interpolateBlues);
      } else {
        return d3.scaleSequential()
          .domain([0.4, 2.2])
          .interpolator(d3.interpolateRdYlGn);
      }
    }

    function getFill(feature, mode, colorScale) {
      var d = dataByName[feature.properties.name];
      if (!d) return '#eee';
      var val = mode === 'accessions' ? d.army_accessions : d.army_ratio;
      return colorScale(val);
    }

    function drawLegend(mode, colorScale) {
      var el = document.getElementById('origins-legend');
      el.innerHTML = '';

      var label = document.createElement('span');
      label.textContent = mode === 'accessions' ? 'Fewer recruits' : 'Under-represented';
      label.style.marginRight = '6px';
      el.appendChild(label);

      var steps = 8;
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        var domain = colorScale.domain();
        var val = domain[0] + t * (domain[1] - domain[0]);
        var sw = document.createElement('div');
        sw.className = 'legend-swatch';
        sw.style.background = colorScale(val);
        sw.style.border = 'none';
        el.appendChild(sw);
      }

      var label2 = document.createElement('span');
      label2.textContent = mode === 'accessions' ? 'More recruits' : 'Over-represented';
      label2.style.marginLeft = '6px';
      el.appendChild(label2);
    }

    function render(mode) {
      var colorScale = getColorScale(mode);

      svg.selectAll('.state')
        .data(states.features)
        .join('path')
        .attr('class', 'state')
        .attr('d', path)
        .attr('fill', function (d) { return getFill(d, mode, colorScale); })
        .attr('stroke', function (d) {
          return d.properties.name === paramState ? '#e74c3c' : '#fff';
        })
        .attr('stroke-width', function (d) {
          return d.properties.name === paramState ? '2.5px' : '0.8px';
        })
        .on('mousemove', function (event, d) {
          var rec = dataByName[d.properties.name];
          if (!rec) return;
          tooltip.style.display = 'block';
          tooltip.style.left = (event.pageX + 12) + 'px';
          tooltip.style.top  = (event.pageY - 28) + 'px';
          tooltip.innerHTML =
            '<strong>' + rec.state + '</strong>' +
            'Estimated recruits: ' + rec.army_accessions.toLocaleString() + '<br>' +
            'Representation ratio: ' + rec.army_ratio.toFixed(2) + 'x<br>' +
            'Civilian 18–24 pop share: ' + rec.civ_pct_18_24 + '%<br>' +
            '<span style="color:#aaa;font-size:11px">Click to see veteran destinations →</span>';
        })
        .on('mouseleave', function () {
          tooltip.style.display = 'none';
        })
        .on('click', function (event, d) {
          // Navigate to destinations page highlighting this state
          var stateName = d.properties.name;
          window.location.href = './destinations.html?state=' + encodeURIComponent(stateName) + '&from=origins';
        });

      // State borders
      svg.selectAll('.state-border').remove();
      svg.append('path')
        .attr('class', 'state-border')
        .datum(topojson.mesh(topo, topo.objects.states, function (a, b) { return a !== b; }))
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', '#fff')
        .attr('stroke-width', '1px');

      drawLegend(mode, colorScale);
    }

    render(colorMode.value);
    colorMode.addEventListener('change', function () { render(this.value); });

    // Update the destinations cross-link with current state highlight if set
    var destLink = document.getElementById('cross-destinations');
    if (destLink && paramState) {
      destLink.href = './destinations.html?state=' + encodeURIComponent(paramState) + '&from=origins';
    }
  });

})();
