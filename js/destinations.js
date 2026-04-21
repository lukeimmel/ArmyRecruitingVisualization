(function () {

  var width = 960, height = 600;

  var svg = d3.select('#dest-map')
    .attr('width', width)
    .attr('height', height);

  var projection = d3.geoAlbersUsa().scale(1280).translate([480, 300]);
  var path = d3.geoPath(projection);

  var tooltip = document.getElementById('tooltip');

  // URL params
  var urlParams  = new URLSearchParams(window.location.search);
  var paramState = urlParams.get('state') || '';
  var paramMoc   = (urlParams.get('moc') || '').toUpperCase();
  var paramFrom  = urlParams.get('from') || '';

  // Context banner
  if (paramFrom || paramState) {
    var banner = document.getElementById('context-banner');
    if (banner) {
      var fromLabels = { origins: 'Recruit Origins', mos: 'MOS Explorer' };
      banner.style.display = 'block';
      if (paramState) {
        banner.innerHTML = 'Showing veteran population'
          + (paramFrom ? ', arriving from <strong>' + (fromLabels[paramFrom] || paramFrom) + '</strong>' : '')
          + ' &mdash; <strong>' + paramState + '</strong> counties highlighted.';
      } else {
        banner.innerHTML = 'Exploring from <strong>' + (fromLabels[paramFrom] || paramFrom) + '</strong>.'
          + (paramMoc ? ' MOS pre-selected: <strong>' + paramMoc + '</strong>' : '');
      }
    }
  }

  // State FIPS lookup
  var STATE_FIPS = {
    'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
    'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
    'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
    'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
    'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
    'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
    'WV':'54','WI':'55','WY':'56'
  };

  Promise.all([
    d3.json('./assets/counties-10m.json'),
    d3.json('./data/vet_destinations_county.json'),
    d3.json('./data/mos_army.json'),
    d3.json('./data/state_wages.json')
  ]).then(function (results) {

    var topo        = results[0];
    var destData    = results[1];
    var mosData     = results[2];
    var stateWages  = results[3];

    var counties = topojson.feature(topo, topo.objects.counties);
    var states   = topojson.feature(topo, topo.objects.states);

    // Build lookup: FIPS → vet data
    var dataByFips = {};
    destData.forEach(function (d) { dataByFips[d.fips] = d; });

    // State FIPS → name from TopoJSON
    var stateName = {};
    var stateFipsByName = {};
    states.features.forEach(function (f) {
      stateName[f.id] = f.properties.name;
      stateFipsByName[f.properties.name] = f.id;
    });

    // Compute top state
    var stateTotals = {};
    destData.forEach(function (d) {
      var stFips = d.fips.slice(0, 2);
      stateTotals[stFips] = (stateTotals[stFips] || 0) + d.total;
    });
    var topStateFips = Object.keys(stateTotals).sort(function (a, b) {
      return stateTotals[b] - stateTotals[a];
    })[0];
    document.getElementById('top-state').textContent = stateName[topStateFips] || topStateFips;

    // Highlighted state FIPS from URL param
    var highlightFips = paramState ? stateFipsByName[paramState] : null;

    // ── Populate MOS selector ────────────────────────────────────────────
    var mosSelect = document.getElementById('mos-select');
    mosData.forEach(function (mos, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = mos.moc + ' — ' + mos.title;
      mosSelect.appendChild(opt);
    });

    // Pre-select from URL param
    var selectedMosIdx = -1;
    if (paramMoc) {
      selectedMosIdx = mosData.findIndex(function (m) { return m.moc === paramMoc; });
    }
    if (selectedMosIdx === -1) {
      selectedMosIdx = mosData.findIndex(function (m) { return m.moc === '25U'; });
    }
    if (selectedMosIdx >= 0) mosSelect.value = selectedMosIdx;

    // Update cross-link to MOS explorer
    var crossMos = document.getElementById('cross-mos');
    if (crossMos && selectedMosIdx >= 0) {
      crossMos.href = './mos-explorer.html?moc=' + mosData[selectedMosIdx].moc + '&from=destinations';
    }

    mosSelect.addEventListener('change', function () {
      selectedMosIdx = this.value !== '' ? +this.value : -1;
      // Close career panel when MOS changes
      document.getElementById('career-panel').style.display = 'none';
      // Update hint
      updateMapHint();
      if (crossMos && selectedMosIdx >= 0) {
        crossMos.href = './mos-explorer.html?moc=' + mosData[selectedMosIdx].moc + '&from=destinations';
      }
    });

    function updateMapHint() {
      var hint = document.getElementById('map-hint');
      if (!hint) return;
      if (selectedMosIdx >= 0) {
        hint.textContent = 'Click any county to see local career wages for ' + mosData[selectedMosIdx].moc + ' — ' + mosData[selectedMosIdx].title + ' →';
      } else {
        hint.textContent = 'Select an MOS above, then click any county to see local career wages →';
      }
    }
    updateMapHint();

    // ── Career panel ─────────────────────────────────────────────────────
    document.getElementById('career-panel-close').addEventListener('click', function () {
      document.getElementById('career-panel').style.display = 'none';
    });

    function showCareerPanel(countyData) {
      if (selectedMosIdx < 0) return;
      var mos = mosData[selectedMosIdx];
      var stateFips = countyData.fips.slice(0, 2);
      var stAbbr = Object.keys(STATE_FIPS).find(function (k) { return STATE_FIPS[k] === stateFips; });
      var stWages = stateWages[stateFips] || {};

      document.getElementById('career-panel-title').textContent =
        'Career Outlook in ' + countyData.state + ' for ' + mos.moc + ' — ' + mos.title;
      document.getElementById('career-panel-sub').textContent =
        countyData.name + ' · ' + countyData.total.toLocaleString() + ' veterans · Click another county to compare';

      // Show top 6 direct jobs + top 4 related with local vs national comparison
      var directJobs  = mos.jobs.filter(function (j) { return j.source !== 'related'; });
      var relatedJobs = mos.jobs.filter(function (j) { return j.source === 'related'; });
      var showJobs = directJobs.concat(relatedJobs.slice(0, Math.max(0, 8 - directJobs.length)));

      var body = document.getElementById('career-panel-body');
      body.innerHTML = '';

      // Header row
      var headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:grid;grid-template-columns:1fr 110px 110px 70px;gap:8px;padding:6px 0;border-bottom:1px solid #eee;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;';
      headerRow.innerHTML =
        '<div>Occupation</div>' +
        '<div style="text-align:right">' + countyData.state + ' Median</div>' +
        '<div style="text-align:right">National</div>' +
        '<div style="text-align:right">Diff</div>';
      body.appendChild(headerRow);

      showJobs.forEach(function (job) {
        var localWage = stWages[job.soc_code];
        var nationalWage = job.median_annual_wage;
        var isRelated = job.source === 'related';

        var row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:1fr 110px 110px 70px;gap:8px;padding:9px 0;border-bottom:1px solid #f5f5f5;align-items:center;';

        var diffHtml = '—';
        var diffColor = '#aaa';
        if (localWage && nationalWage) {
          var diff = Math.round((localWage.median - nationalWage) / nationalWage * 100);
          diffColor = diff >= 0 ? '#27ae60' : '#e74c3c';
          diffHtml = (diff >= 0 ? '+' : '') + diff + '%';
        }

        var badgeHtml = '';
        if (job.match === 'Strong Match') badgeHtml = '<span style="font-size:9px;background:#2c3e50;color:#fff;padding:2px 7px;border-radius:10px;margin-left:6px;vertical-align:middle">Direct</span>';

        row.innerHTML =
          '<div style="font-size:13px;font-weight:' + (isRelated ? '400' : '600') + ';color:' + (isRelated ? '#666' : '#2c3e50') + '">' +
            job.title + badgeHtml +
          '</div>' +
          '<div style="text-align:right;font-size:13px;font-weight:600;color:#2c3e50">' +
            (localWage ? '$' + localWage.median.toLocaleString() : '<span style="color:#bbb">N/A</span>') +
          '</div>' +
          '<div style="text-align:right;font-size:13px;color:#888">' +
            (nationalWage ? '$' + nationalWage.toLocaleString() : '—') +
          '</div>' +
          '<div style="text-align:right;font-size:13px;font-weight:700;color:' + diffColor + '">' + diffHtml + '</div>';

        body.appendChild(row);
      });

      document.getElementById('career-panel').style.display = 'block';
      // Scroll panel into view
      document.getElementById('career-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ── Sex filter ───────────────────────────────────────────────────────
    var sexFilter = document.getElementById('sex-filter');

    function getVal(d, field) {
      if (field === 'total')  return d.total;
      if (field === 'male')   return d.male;
      if (field === 'female') return d.female;
      return d.total;
    }

    function render(field) {
      var vals = destData.map(function (d) { return getVal(d, field); }).filter(Boolean);
      var maxVal = d3.quantile(vals.slice().sort(d3.ascending), 0.97);

      var colorScale = d3.scaleSequential()
        .domain([0, maxVal])
        .interpolator(d3.interpolateBlues);

      svg.selectAll('.county')
        .data(counties.features)
        .join('path')
        .attr('class', 'county')
        .attr('d', path)
        .attr('fill', function (f) {
          var fips = f.id.toString().padStart(5, '0');
          var d = dataByFips[fips];
          if (!d) return '#f0f0f0';
          var val = getVal(d, field);
          return val > 0 ? colorScale(val) : '#f0f0f0';
        })
        .attr('stroke', function (f) {
          var countyFips = f.id.toString().padStart(5, '0');
          var stFips = countyFips.slice(0, 2);
          if (highlightFips && stFips === String(highlightFips).padStart(2, '0')) return '#e74c3c';
          return '#ccc';
        })
        .attr('stroke-width', function (f) {
          var countyFips = f.id.toString().padStart(5, '0');
          var stFips = countyFips.slice(0, 2);
          if (highlightFips && stFips === String(highlightFips).padStart(2, '0')) return '0.8px';
          return '0.2px';
        })
        .on('mousemove', function (event, f) {
          var fips = f.id.toString().padStart(5, '0');
          var d = dataByFips[fips];
          if (!d) return;
          tooltip.style.display = 'block';
          tooltip.style.left = (event.pageX + 12) + 'px';
          tooltip.style.top  = (event.pageY - 28) + 'px';
          var clickHint = selectedMosIdx >= 0
            ? 'Click to see ' + mosData[selectedMosIdx].moc + ' career wages in ' + d.state + ' →'
            : 'Select an MOS above to compare local career wages';
          tooltip.innerHTML =
            '<strong>' + d.name + '</strong>' +
            'Total veterans: ' + d.total.toLocaleString() + '<br>' +
            'Male: ' + d.male.toLocaleString() + '&nbsp;&nbsp;' +
            'Female: ' + d.female.toLocaleString() + '<br>' +
            '<span style="color:#aaa;font-size:11px">' + clickHint + '</span>';
        })
        .on('mouseleave', function () {
          tooltip.style.display = 'none';
        })
        .on('click', function (event, f) {
          var fips = f.id.toString().padStart(5, '0');
          var d = dataByFips[fips];
          if (!d || selectedMosIdx < 0) return;
          showCareerPanel(d);
        });

      // State borders
      svg.selectAll('.state-outline').remove();
      svg.append('path')
        .attr('class', 'state-outline')
        .datum(topojson.mesh(topo, topo.objects.states, function (a, b) { return a !== b; }))
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', '#666')
        .attr('stroke-width', '0.8px');

      // Highlighted state border
      if (highlightFips) {
        svg.selectAll('.state-highlight').remove();
        var highlightFeature = states.features.find(function (f) {
          return String(f.id) === String(highlightFips);
        });
        if (highlightFeature) {
          svg.append('path')
            .attr('class', 'state-highlight')
            .datum(highlightFeature)
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', '#e74c3c')
            .attr('stroke-width', '2px');
        }
      }

      drawLegend(colorScale, maxVal);
    }

    function drawLegend(colorScale, maxVal) {
      var el = document.getElementById('dest-legend');
      el.innerHTML = '';

      var label = document.createElement('span');
      label.textContent = 'Fewer veterans';
      label.style.marginRight = '6px';
      el.appendChild(label);

      var steps = 10;
      for (var i = 0; i <= steps; i++) {
        var sw = document.createElement('div');
        sw.className = 'legend-swatch';
        sw.style.background = colorScale(i / steps * maxVal);
        sw.style.border = 'none';
        el.appendChild(sw);
      }

      var label2 = document.createElement('span');
      label2.textContent = 'More veterans';
      label2.style.marginLeft = '6px';
      el.appendChild(label2);

      var note = document.createElement('span');
      note.textContent = ' (capped at 97th percentile)';
      note.style.color = '#bbb';
      note.style.fontSize = '10px';
      el.appendChild(note);

      if (paramState) {
        var stateNote = document.createElement('span');
        stateNote.textContent = ' · Highlighted: ' + paramState;
        stateNote.style.color = '#e74c3c';
        stateNote.style.fontSize = '11px';
        stateNote.style.fontWeight = '600';
        el.appendChild(stateNote);
      }
    }

    render(sexFilter.value);
    sexFilter.addEventListener('change', function () { render(this.value); });
  });

})();
