(function () {

  // Shared state 
  var state = {
    originsMode: 'accessions',
    selectedStateName: null,   // carries from Origins → Destinations
    selectedMosIdx: -1,        // carries from MOS → Destinations
    sexFilter: 'total',
    // loaded data
    stateTopo: null,
    countyTopo: null,
    originsData: null,
    destData: null,
    mosData: null,
    stateWages: null,
    vetOcc: null,
    // lookups built after load
    dataByName: {},
    dataByFips: {},
    stateName: {},
    stateFipsByName: {},
    stateAbbrToFips: {
      'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
      'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
      'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
      'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
      'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
      'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
      'WV':'54','WI':'55','WY':'56'
    }
  };

  var tooltip = document.getElementById('tooltip');

  // Load all data in parallel
  Promise.all([
    d3.json('./assets/states-10m.json'),
    d3.json('./assets/counties-10m.json'),
    d3.json('./data/recruit_origins_state.json'),
    d3.json('./data/vet_destinations_county.json'),
    d3.json('./data/mos_army.json'),
    d3.json('./data/state_wages.json'),
    d3.json('./data/vet_occupations.json')
  ]).then(function (results) {
    state.stateTopo   = results[0];
    state.countyTopo  = results[1];
    state.originsData = results[2];
    state.destData    = results[3];
    state.mosData     = results[4];
    state.stateWages  = results[5];
    state.vetOcc      = results[6];

    buildLookups();
    populateMosSelects();
    initOriginsMap();
    initDestMap();
    initScrollama();
    wireControls();

    // Default MOS to 25U
    var defaultIdx = state.mosData.findIndex(function (m) { return m.moc === '25U'; });
    if (defaultIdx === -1) defaultIdx = 0;
    setMos(defaultIdx);
  });

  // Build data lookups
  function buildLookups() {
    state.originsData.forEach(function (d) { state.dataByName[d.state] = d; });
    state.destData.forEach(function (d) { state.dataByFips[d.fips] = d; });

    var statesGeo = topojson.feature(state.stateTopo, state.stateTopo.objects.states);
    statesGeo.features.forEach(function (f) {
      state.stateName[f.id] = f.properties.name;
      state.stateFipsByName[f.properties.name] = f.id;
    });
  }

  // Populate both MOS selects
  function populateMosSelects() {
    ['s-mos-select', 's-dest-mos-select'].forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      state.mosData.forEach(function (mos, i) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = mos.moc + ' - ' + mos.title;
        sel.appendChild(opt);
      });
    });
  }

  // ORIGINS MAP

  var originsSvg, originsPath, originsStates;

  function initOriginsMap() {
    var projection = d3.geoAlbersUsa().scale(1280).translate([480, 300]);
    originsPath   = d3.geoPath(projection);
    originsStates = topojson.feature(state.stateTopo, state.stateTopo.objects.states);

    originsSvg = d3.select('#s-origins-map');
    renderOriginsMap('accessions', null);
  }

  function renderOriginsMap(mode, highlightName) {
    state.originsMode = mode;

    var colorScale = getOriginsColorScale(mode);

    originsSvg.selectAll('.s-state')
      .data(originsStates.features)
      .join('path')
      .attr('class', 's-state')
      .attr('d', originsPath)
      .attr('fill', function (f) {
        var d = state.dataByName[f.properties.name];
        if (!d) return '#eee';
        return colorScale(mode === 'accessions' ? d.army_accessions : d.army_ratio);
      })
      .attr('stroke', function (f) {
        if (f.properties.name === highlightName) return '#e74c3c';
        if (f.properties.name === state.selectedStateName) return '#e74c3c';
        return '#fff';
      })
      .attr('stroke-width', function (f) {
        if (f.properties.name === highlightName) return '2.5px';
        if (f.properties.name === state.selectedStateName) return '2.5px';
        return '0.8px';
      })
      .on('mousemove', function (event, f) {
        var d = state.dataByName[f.properties.name];
        if (!d) return;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 12) + 'px';
        tooltip.style.top  = (event.pageY - 28) + 'px';
        tooltip.innerHTML =
          '<strong>' + d.state + '</strong>' +
          'Estimated recruits: ' + d.army_accessions.toLocaleString() + '<br>' +
          'Representation ratio: ' + d.army_ratio.toFixed(2) + 'x<br>' +
          'Civilian 18–24 pop share: ' + d.civ_pct_18_24 + '%<br>' +
          '<span style="color:#aaa;font-size:11px">Click to select this state →</span>';
      })
      .on('mouseleave', function () { tooltip.style.display = 'none'; })
      .on('click', function (event, f) { selectState(f.properties.name); });

    // State mesh borders
    originsSvg.selectAll('.s-state-border').remove();
    originsSvg.append('path')
      .attr('class', 's-state-border')
      .datum(topojson.mesh(state.stateTopo, state.stateTopo.objects.states, function (a, b) { return a !== b; }))
      .attr('d', originsPath)
      .attr('fill', 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', '0.8px');

    drawOriginsLegend(colorScale, mode);
  }

  function getOriginsColorScale(mode) {
    if (mode === 'accessions') {
      var vals = state.originsData.map(function (d) { return d.army_accessions; });
      return d3.scaleSequential().domain([0, d3.max(vals)]).interpolator(d3.interpolateBlues);
    }
    return d3.scaleSequential().domain([0.4, 2.2]).interpolator(d3.interpolateRdYlGn);
  }

  function drawOriginsLegend(colorScale, mode) {
    var el = document.getElementById('s-origins-legend');
    el.innerHTML = '';

    var l1 = document.createElement('span');
    l1.textContent = mode === 'accessions' ? 'Fewer' : 'Under-represented';
    l1.style.marginRight = '4px';
    el.appendChild(l1);

    for (var i = 0; i <= 8; i++) {
      var t = i / 8;
      var domain = colorScale.domain();
      var sw = document.createElement('div');
      sw.className = 'legend-swatch';
      sw.style.background = colorScale(domain[0] + t * (domain[1] - domain[0]));
      sw.style.border = 'none';
      el.appendChild(sw);
    }

    var l2 = document.createElement('span');
    l2.textContent = mode === 'accessions' ? 'More recruits' : 'Over-represented';
    l2.style.marginLeft = '4px';
    el.appendChild(l2);
  }

  function selectState(name) {
    state.selectedStateName = name;

    // Re-render to show red border
    renderOriginsMap(state.originsMode, name);

    // Show context labels
    document.getElementById('origins-selected-state').textContent = name;
    document.getElementById('origins-state-context').style.display = 'block';
    document.getElementById('origins-carry-state').textContent = name;
    document.getElementById('origins-continue').style.display = 'flex';

    // Propagate to other sections
    updateMosStateContext();
    updateDestContext();
  }

  // MOS EXPLORER

  function setMos(idx) {
    state.selectedMosIdx = idx;
    if (idx < 0 || !state.mosData) return;

    var mos = state.mosData[idx];
    renderMosKpis(mos);
    renderMosBars(mos);
    renderVetOcc(mos);

    // Sync both selects
    var sel1 = document.getElementById('s-mos-select');
    var sel2 = document.getElementById('s-dest-mos-select');
    if (sel1) sel1.value = idx;
    if (sel2) sel2.value = idx;

    // Show continue button
    document.getElementById('btn-to-dest').style.display = 'inline-block';
    document.getElementById('mos-select-prompt').style.display = 'none';

    updateDestContext();
  }

  function renderMosKpis(mos) {
    var directJobs = mos.jobs.filter(function (j) { return j.source !== 'related'; });
    var primaryJob = directJobs[0] || mos.jobs[0];

    document.getElementById('s-kpi-salary').textContent =
      mos.avg_salary ? '$' + Math.round(mos.avg_salary / 1000) + 'K' : 'N/A';
    document.getElementById('s-kpi-growth').textContent =
      primaryJob && primaryJob.growth_pct != null ? primaryJob.growth_pct + '%' : 'N/A';
    document.getElementById('s-kpi-openings').textContent =
      primaryJob && primaryJob.annual_openings ? fmtOpenings(primaryJob.annual_openings) : 'N/A';
    document.getElementById('s-kpi-matches').textContent = mos.jobs.length;
  }

  function renderMosBars(mos) {
    var el = document.getElementById('s-career-bars');
    el.innerHTML = '';

    // Compute employment share
    var hasShare = mos.jobs.some(function (j) { return j.employment_share_pct != null; });
    mos.jobs.forEach(function (j) {
      j._pct = hasShare && j.employment_share_pct != null
        ? j.employment_share_pct
        : Math.round(100 / mos.jobs.length);
    });

    mos.jobs.forEach(function (job) {
      var pct = job._pct || 0;
      var isRelated = job.source === 'related';
      var barColor = isRelated ? '#9ab0cc' : '#2c3e50';
      var labelColor = isRelated ? '#888' : '#444';
      var displayPct = pct > 0 ? pct + '%' : '<1%';

      var row = document.createElement('div');
      row.className = 'bar-row';
      row.style.alignItems = 'flex-start';
      row.style.marginBottom = '8px';

      var barHtml;
      if (pct < 1) {
        barHtml = '<div class="bar-track"><div style="width:3px;height:100%;background:' + barColor + ';display:inline-block"></div></div>';
      } else {
        barHtml =
          '<div class="bar-track">' +
            '<div class="bar-fill" style="width:' + pct + '%;background:' + barColor + '">' +
              '<span class="bar-pct">' + (pct >= 8 ? displayPct : '') + '</span>' +
            '</div>' +
          '</div>';
      }

      row.innerHTML =
        '<div class="bar-label" style="font-size:11px;color:' + labelColor + ';font-weight:' + (isRelated ? '400' : '600') + ';width:160px">' + job.title + '</div>' +
        barHtml +
        '<div style="font-size:10px;color:#888;width:34px;text-align:right;flex-shrink:0;padding-top:3px">' + displayPct + '</div>';
      el.appendChild(row);
    });

    // Legend
    var leg = document.getElementById('s-bar-legend');
    leg.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:4px">' +
        '<span style="width:10px;height:10px;background:#2c3e50;display:inline-block"></span>' +
        '<span style="font-size:10px;color:#888">Direct match</span>' +
      '</span>' +
      '<span style="display:inline-flex;align-items:center;gap:4px">' +
        '<span style="width:10px;height:10px;background:#9ab0cc;display:inline-block"></span>' +
        '<span style="font-size:10px;color:#888">Related</span>' +
      '</span>';
  }

  function renderVetOcc(mos) {
    var el = document.getElementById('s-vet-occ-bars');
    if (!el || !state.vetOcc) return;
    el.innerHTML = '';

    var mosSocGroups = {};
    mos.jobs.forEach(function (j) {
      if (j.soc_code) mosSocGroups[j.soc_code.substring(0, 2)] = true;
    });

    var highlights = [];
    state.vetOcc.categories.forEach(function (cat) {
      var isMatch = cat.soc_groups.some(function (g) { return mosSocGroups[g]; });
      if (isMatch) highlights.push(cat.label);

      var row = document.createElement('div');
      row.className = 'occ-bar-row';
      row.innerHTML =
        '<div class="occ-bar-label" style="font-size:11px;width:160px;color:' + (isMatch ? '#2c3e50' : '#888') + ';font-weight:' + (isMatch ? '700' : '400') + '">' + cat.label + '</div>' +
        '<div class="occ-bar-track">' +
          '<div class="occ-bar-fill" style="width:' + cat.pct + '%;background:' + (isMatch ? cat.color : '#ddd') + '">' +
            '<span class="occ-bar-pct">' + (cat.pct > 8 ? cat.pct.toFixed(1) + '%' : '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="occ-bar-pct-outside">' + (cat.pct <= 8 ? cat.pct.toFixed(1) + '%' : '') + '</div>';
      el.appendChild(row);
    });

    var noteEl = document.getElementById('s-vet-occ-note');
    if (noteEl) {
      if (highlights.length > 0) {
        noteEl.style.display = 'block';
        noteEl.textContent = mos.moc + ' skills align with: ' + highlights.join(', ') + '.';
      } else {
        noteEl.style.display = 'none';
      }
    }
  }

  function updateMosStateContext() {
    var ctx = document.getElementById('mos-state-context');
    var lbl = document.getElementById('mos-carrying-state');
    if (!ctx || !lbl) return;
    if (state.selectedStateName) {
      lbl.textContent = state.selectedStateName;
      ctx.style.display = 'block';
    } else {
      ctx.style.display = 'none';
    }
  }

  // DESTINATIONS MAP

  var destSvg, destPath, destCounties, destStates;

  function initDestMap() {
    var projection = d3.geoAlbersUsa().scale(1280).translate([480, 300]);
    destPath    = d3.geoPath(projection);
    destCounties = topojson.feature(state.countyTopo, state.countyTopo.objects.counties);
    destStates   = topojson.feature(state.countyTopo, state.countyTopo.objects.states);
    destSvg = d3.select('#s-dest-map');
    renderDestMap('total');
  }

  function renderDestMap(field) {
    state.sexFilter = field;

    var vals = state.destData.map(function (d) { return getDestVal(d, field); }).filter(Boolean);
    var maxVal = d3.quantile(vals.slice().sort(d3.ascending), 0.97);
    var colorScale = d3.scaleSequential().domain([0, maxVal]).interpolator(d3.interpolateBlues);

    // Resolve highlighted state FIPS from selected state name
    var highlightFips = state.selectedStateName
      ? String(state.stateFipsByName[state.selectedStateName]).padStart(2, '0')
      : null;

    destSvg.selectAll('.s-county')
      .data(destCounties.features)
      .join('path')
      .attr('class', 's-county')
      .attr('d', destPath)
      .attr('fill', function (f) {
        var fips = f.id.toString().padStart(5, '0');
        var d = state.dataByFips[fips];
        if (!d) return '#f0f0f0';
        var val = getDestVal(d, field);
        return val > 0 ? colorScale(val) : '#f0f0f0';
      })
      .attr('stroke', function (f) {
        var stFips = f.id.toString().padStart(5, '0').slice(0, 2);
        return (highlightFips && stFips === highlightFips) ? '#e74c3c' : '#ccc';
      })
      .attr('stroke-width', function (f) {
        var stFips = f.id.toString().padStart(5, '0').slice(0, 2);
        return (highlightFips && stFips === highlightFips) ? '0.8px' : '0.15px';
      })
      .on('mousemove', function (event, f) {
        var fips = f.id.toString().padStart(5, '0');
        var d = state.dataByFips[fips];
        if (!d) return;
        tooltip.style.display = 'block';
        tooltip.style.left = (event.pageX + 12) + 'px';
        tooltip.style.top  = (event.pageY - 28) + 'px';
        var mosHint = state.selectedMosIdx >= 0
          ? 'Click to see ' + state.mosData[state.selectedMosIdx].moc + ' wages in ' + d.state + ' →'
          : 'Select an MOS above to compare local wages';
        tooltip.innerHTML =
          '<strong>' + d.name + '</strong>' +
          'Veterans: ' + d.total.toLocaleString() + '<br>' +
          'Male: ' + d.male.toLocaleString() + ' &nbsp; Female: ' + d.female.toLocaleString() + '<br>' +
          '<span style="color:#aaa;font-size:11px">' + mosHint + '</span>';
      })
      .on('mouseleave', function () { tooltip.style.display = 'none'; })
      .on('click', function (event, f) {
        var fips = f.id.toString().padStart(5, '0');
        var d = state.dataByFips[fips];
        if (!d || state.selectedMosIdx < 0) return;
        showCareerPanel(d);
      });

    // State borders
    destSvg.selectAll('.s-state-outline').remove();
    destSvg.append('path')
      .attr('class', 's-state-outline')
      .datum(topojson.mesh(state.countyTopo, state.countyTopo.objects.states, function (a, b) { return a !== b; }))
      .attr('d', destPath)
      .attr('fill', 'none')
      .attr('stroke', '#666')
      .attr('stroke-width', '0.6px');

    // Highlight state border if selected
    if (highlightFips) {
      destSvg.selectAll('.s-state-highlight').remove();
      var hf = destStates.features.find(function (f) {
        return String(f.id).padStart(2,'0') === highlightFips;
      });
      if (hf) {
        destSvg.append('path')
          .attr('class', 's-state-highlight')
          .datum(hf)
          .attr('d', destPath)
          .attr('fill', 'none')
          .attr('stroke', '#e74c3c')
          .attr('stroke-width', '2px');
      }
    }

    drawDestLegend(colorScale, maxVal);
  }

  function getDestVal(d, field) {
    if (field === 'male')   return d.male;
    if (field === 'female') return d.female;
    return d.total;
  }

  function drawDestLegend(colorScale, maxVal) {
    var el = document.getElementById('s-dest-legend');
    el.innerHTML = '';
    var l1 = document.createElement('span'); l1.textContent = 'Fewer veterans'; l1.style.marginRight='4px'; el.appendChild(l1);
    for (var i = 0; i <= 10; i++) {
      var sw = document.createElement('div');
      sw.className = 'legend-swatch';
      sw.style.background = colorScale(i / 10 * maxVal);
      sw.style.border = 'none';
      el.appendChild(sw);
    }
    var l2 = document.createElement('span'); l2.textContent = 'More'; l2.style.marginLeft='4px'; el.appendChild(l2);
    var note = document.createElement('span');
    note.textContent = ' (97th pct cap)';
    note.style.color = '#bbb'; note.style.fontSize = '10px';
    el.appendChild(note);
  }

  function showCareerPanel(countyData) {
    if (state.selectedMosIdx < 0) return;
    var mos = state.mosData[state.selectedMosIdx];
    var stateFips = countyData.fips.slice(0, 2);
    var stWages = state.stateWages[stateFips] || {};

    document.getElementById('s-career-panel-title').textContent =
      countyData.state + ' - ' + mos.moc + ' career wages vs national';

    var directJobs  = mos.jobs.filter(function (j) { return j.source !== 'related'; });
    var relatedJobs = mos.jobs.filter(function (j) { return j.source === 'related'; });
    var showJobs = directJobs.concat(relatedJobs.slice(0, Math.max(0, 7 - directJobs.length)));

    var body = document.getElementById('s-career-panel-body');
    body.innerHTML = '';

    // Header
    var hdr = document.createElement('div');
    hdr.className = 'career-table-row header';
    hdr.innerHTML =
      '<div>Occupation</div>' +
      '<div style="text-align:right">' + countyData.state + '</div>' +
      '<div style="text-align:right">National</div>' +
      '<div style="text-align:right">Diff</div>';
    body.appendChild(hdr);

    showJobs.forEach(function (job) {
      var localWage = stWages[job.soc_code];
      var natWage   = job.median_annual_wage;
      var diffHtml = '-', diffColor = '#aaa';
      if (localWage && natWage) {
        var diff = Math.round((localWage.median - natWage) / natWage * 100);
        diffColor = diff >= 0 ? '#27ae60' : '#e74c3c';
        diffHtml = (diff >= 0 ? '+' : '') + diff + '%';
      }
      var isDirect = job.source !== 'related';
      var row = document.createElement('div');
      row.className = 'career-table-row';
      row.innerHTML =
        '<div style="font-weight:' + (isDirect ? '600' : '400') + ';color:' + (isDirect ? '#2c3e50' : '#666') + ';font-size:11px">' + job.title + '</div>' +
        '<div style="text-align:right;font-weight:600;color:#2c3e50;font-size:12px">' + (localWage ? '$' + localWage.median.toLocaleString() : '<span style="color:#bbb">N/A</span>') + '</div>' +
        '<div style="text-align:right;color:#888;font-size:12px">' + (natWage ? '$' + natWage.toLocaleString() : '-') + '</div>' +
        '<div style="text-align:right;font-weight:700;color:' + diffColor + ';font-size:12px">' + diffHtml + '</div>';
      body.appendChild(row);
    });

    var panel = document.getElementById('s-career-panel');
    panel.classList.add('visible');
  }

  function updateDestContext() {
    var ctx = document.getElementById('dest-context');
    var stEl = document.getElementById('dest-carrying-state');
    var mosEl = document.getElementById('dest-carrying-mos');
    if (!ctx) return;
    var hasState = !!state.selectedStateName;
    var hasMos   = state.selectedMosIdx >= 0;
    if (hasState || hasMos) {
      ctx.style.display = 'block';
      stEl.textContent = hasState ? state.selectedStateName + ' highlighted' : 'No state selected';
      mosEl.textContent = hasMos ? state.mosData[state.selectedMosIdx].moc : 'No MOS selected';
    } else {
      ctx.style.display = 'none';
    }
  }

  // SCROLLAMA

  function initScrollama() {
    // Origins scroller
    scrollama().setup({ step: '#sec-origins .scroll-step', offset: 0.55 })
      .onStepEnter(function (r) {
        setActiveStep(r.element);
        handleOriginsStep(+r.element.dataset.step);
      });

    // MOS scroller
    scrollama().setup({ step: '#sec-mos .scroll-step', offset: 0.55 })
      .onStepEnter(function (r) {
        setActiveStep(r.element);
        handleMosStep(+r.element.dataset.step);
      });

    // Destinations scroller
    scrollama().setup({ step: '#sec-destinations .scroll-step', offset: 0.55 })
      .onStepEnter(function (r) {
        setActiveStep(r.element);
        handleDestStep(+r.element.dataset.step);
      });
  }

  function setActiveStep(el) {
    document.querySelectorAll('.scroll-step.is-active').forEach(function (s) {
      s.classList.remove('is-active');
    });
    el.classList.add('is-active');
  }

  function handleOriginsStep(idx) {
    if (idx === 0) {
      renderOriginsMap('accessions', null);
    } else if (idx === 1) {
      // Highlight Texas to illustrate
      renderOriginsMap('accessions', 'Texas');
    } else if (idx === 2) {
      // Switch to ratio mode
      document.getElementById('s-color-mode').value = 'ratio';
      renderOriginsMap('ratio', null);
    } else if (idx === 3) {
      // Free play - restore accessions, keep any user selection
      document.getElementById('s-color-mode').value = 'accessions';
      renderOriginsMap('accessions', state.selectedStateName);
    }
  }

  function handleMosStep(idx) {
    if (idx === 0) {
      // Show 25U as default example
      var u25 = state.mosData.findIndex(function (m) { return m.moc === '25U'; });
      if (u25 >= 0) setMos(u25);
    } else if (idx === 1) {
      // Ensure 25U is loaded
      var u25 = state.mosData.findIndex(function (m) { return m.moc === '25U'; });
      if (u25 >= 0) setMos(u25);
    } else if (idx === 2) {
      // Keep current MOS, just let user see the bars
    } else if (idx === 3) {
      // Free play
    }
  }

  function handleDestStep(idx) {
    if (idx === 0) {
      renderDestMap(state.sexFilter);
    } else if (idx === 1) {
      renderDestMap(state.sexFilter);
    } else if (idx === 2) {
      // Hint about clicking
      var hint = document.getElementById('dest-hint');
      if (hint && state.selectedMosIdx >= 0) {
        hint.textContent = 'Click any county to see ' + state.mosData[state.selectedMosIdx].moc + ' career wages →';
      }
    } else if (idx === 3) {
      // Free play
    }
  }


  // WIRE ALL CONTROLS

  function wireControls() {
    // Origins: color mode toggle
    document.getElementById('s-color-mode').addEventListener('change', function () {
      renderOriginsMap(this.value, state.selectedStateName);
    });

    // Origins: continue button → smooth scroll to MOS section
    document.getElementById('btn-to-mos').addEventListener('click', function () {
      document.getElementById('sec-mos').scrollIntoView({ behavior: 'smooth' });
    });

    // MOS: select
    document.getElementById('s-mos-select').addEventListener('change', function () {
      if (this.value !== '') setMos(+this.value);
    });

    // MOS: continue button → scroll to destinations
    document.getElementById('btn-to-dest').addEventListener('click', function () {
      document.getElementById('sec-destinations').scrollIntoView({ behavior: 'smooth' });
    });

    // Destinations: sex filter
    document.getElementById('s-sex-filter').addEventListener('change', function () {
      renderDestMap(this.value);
    });

    // Destinations: MOS select (synced with main MOS select)
    document.getElementById('s-dest-mos-select').addEventListener('change', function () {
      if (this.value !== '') setMos(+this.value);
      // Close career panel when MOS changes
      document.getElementById('s-career-panel').classList.remove('visible');
    });

    // Career panel close
    document.getElementById('s-career-panel-close').addEventListener('click', function () {
      document.getElementById('s-career-panel').classList.remove('visible');
    });
  }

  // Helpers 
  function fmtOpenings(n) {
    if (n == null) return 'N/A';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return n.toLocaleString();
  }

})();
