(function () {

  var branchLabels = { E: 'Enlisted', O: 'Officer', W: 'Warrant Officer' };

  // Read URL param ?moc=25U
  var urlParams = new URLSearchParams(window.location.search);
  var paramMoc  = (urlParams.get('moc') || '').toUpperCase();
  var paramFrom = urlParams.get('from') || '';

  // Show context banner if arriving from another page
  if (paramFrom) {
    var banner = document.getElementById('context-banner');
    if (banner) {
      var fromLabels = { origins: 'Recruit Origins', destinations: 'Veteran Destinations' };
      banner.style.display = 'block';
      banner.innerHTML = 'Exploring from <strong>' + (fromLabels[paramFrom] || paramFrom) + '</strong>'
        + (paramMoc ? ' &mdash; pre-selected MOS: <strong>' + paramMoc + '</strong>' : '');
    }
  }

  Promise.all([
    d3.json('./data/mos_army.json'),
    d3.json('./data/vet_occupations.json')
  ]).then(function (results) {

    var data    = results[0];
    var vetOcc  = results[1];

    var select = document.getElementById('mos-select');
    select.innerHTML = '<option value="">— Select an MOS —</option>';

    data.forEach(function (mos, i) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = mos.moc + ' — ' + mos.title;
      select.appendChild(opt);
    });

    // Pre-select from URL param, then fallback to 25U, then 0
    var defaultIdx = -1;
    if (paramMoc) {
      defaultIdx = data.findIndex(function (m) { return m.moc === paramMoc; });
    }
    if (defaultIdx === -1) {
      defaultIdx = data.findIndex(function (m) { return m.moc === '25U'; });
    }
    if (defaultIdx === -1) defaultIdx = 0;

    select.value = defaultIdx;
    render(data[defaultIdx], vetOcc);

    select.addEventListener('change', function () {
      if (this.value === '') { clearDisplay(); return; }
      var mos = data[+this.value];
      render(mos, vetOcc);
      // Update URL param without page reload
      var url = new URL(window.location);
      url.searchParams.set('moc', mos.moc);
      window.history.replaceState({}, '', url);
    });

    // Wire cross-link to destinations
    var destLink = document.getElementById('cross-destinations');
    if (destLink) {
      destLink.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = +select.value;
        var mos = data[idx];
        var url = './destinations.html?from=mos' + (mos ? '&moc=' + mos.moc : '');
        window.location.href = url;
      });
    }

    var originsLink = document.getElementById('cross-origins');
    if (originsLink) {
      originsLink.addEventListener('click', function (e) {
        e.preventDefault();
        var idx = +select.value;
        var mos = data[idx];
        var url = './origins.html?from=mos' + (mos ? '&moc=' + mos.moc : '');
        window.location.href = url;
      });
    }
  });

  function fmt(n) {
    if (n == null) return 'N/A';
    return '$' + Math.round(n / 1000) + 'K';
  }

  function fmtOpenings(n) {
    if (n == null) return 'N/A';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return n.toLocaleString();
  }

  function render(mos, vetOcc) {
    // ── Info bar ──────────────────────────────────────────────────────────
    document.getElementById('info-branch').textContent = branchLabels[mos.branch] || mos.branch || '—';
    document.getElementById('info-dod').textContent    = mos.dod_title || '—';
    document.getElementById('info-paths').textContent  = mos.jobs.length;

    // ── KPIs ──────────────────────────────────────────────────────────────
    document.getElementById('kpi-salary').textContent =
      mos.avg_salary ? '$' + mos.avg_salary.toLocaleString() : 'N/A';

    var directJobs  = mos.jobs.filter(function (j) { return j.source !== 'related'; });
    var relatedJobs = mos.jobs.filter(function (j) { return j.source === 'related'; });
    var primaryJob  = directJobs[0] || mos.jobs[0];

    var growth = primaryJob && primaryJob.growth_pct != null ? primaryJob.growth_pct : null;
    document.getElementById('kpi-growth').textContent = growth != null ? growth + '%' : 'N/A';
    document.getElementById('kpi-growth-sub').textContent =
      primaryJob ? 'Projected change — ' + primaryJob.title : 'Projected change, primary career';

    var openings = primaryJob && primaryJob.annual_openings != null ? primaryJob.annual_openings : null;
    document.getElementById('kpi-openings').textContent = fmtOpenings(openings);
    document.getElementById('kpi-openings-sub').textContent =
      primaryJob ? primaryJob.title : 'National avg, primary career';

    document.getElementById('kpi-matches').textContent = mos.jobs.length;
    document.getElementById('kpi-salary-sub').textContent =
      'Avg across ' + mos.jobs.length + ' mapped career' + (mos.jobs.length !== 1 ? 's' : '');

    // ── Career Paths bar chart ────────────────────────────────────────────
    var barsEl = document.getElementById('career-bars');
    barsEl.innerHTML = '';

    var jobsWithShare = mos.jobs.filter(function (j) {
      return j.employment_share_pct != null;
    });

    if (jobsWithShare.length === 0) {
      var eq = Math.round(100 / mos.jobs.length);
      mos.jobs.forEach(function (j) { j._pct = eq; });
    } else {
      mos.jobs.forEach(function (j) {
        j._pct = j.employment_share_pct != null ? j.employment_share_pct : 0;
      });
    }

    mos.jobs.forEach(function (job) {
      var pct = job._pct || 0;
      var isRelated = job.source === 'related';
      var barColor = isRelated ? '#9ab0cc' : '#2c3e50';
      var labelColor = isRelated ? '#888' : '#444';
      var displayPct = pct > 0 ? pct + '%' : '<1%';

      var row = document.createElement('div');
      row.className = 'bar-row';
      row.style.alignItems = 'flex-start';
      row.style.paddingTop = '2px';

      // For very small bars (< 1%), render as a tick mark instead of a sliver
      var barHtml;
      if (pct < 1) {
        barHtml =
          '<div class="bar-track" style="position:relative">' +
            '<div style="width:3px;height:100%;background:' + barColor + ';display:inline-block"></div>' +
          '</div>';
      } else {
        barHtml =
          '<div class="bar-track">' +
            '<div class="bar-fill" style="width:' + pct + '%;background:' + barColor + '">' +
              '<span class="bar-pct">' + (pct >= 8 ? displayPct : '') + '</span>' +
            '</div>' +
          '</div>';
      }

      row.innerHTML =
        '<div class="bar-label" style="color:' + labelColor + ';font-weight:' + (isRelated ? '400' : '600') + '">' + job.title + '</div>' +
        barHtml +
        '<div style="font-size:11px;color:#888;width:42px;text-align:right;flex-shrink:0;padding-top:3px">' + displayPct + '</div>';
      barsEl.appendChild(row);
    });

    // Legend for bar chart
    var barLegend = document.getElementById('bar-legend');
    if (barLegend) {
      barLegend.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:16px">' +
          '<span style="width:12px;height:12px;background:#2c3e50;display:inline-block"></span>' +
          '<span style="font-size:11px;color:#888">Direct match</span>' +
        '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:5px">' +
          '<span style="width:12px;height:12px;background:#9ab0cc;display:inline-block"></span>' +
          '<span style="font-size:11px;color:#888">Related occupation</span>' +
        '</span>';
    }

    // ── Career Mapping with badges (Direct + Related sections) ────────────
    var matchEl = document.getElementById('career-matches');
    matchEl.innerHTML = '';

    if (directJobs.length > 0) {
      var header = document.createElement('div');
      header.className = 'match-section-header';
      header.textContent = 'Direct MOS Matches';
      matchEl.appendChild(header);

      directJobs.forEach(function (job) {
        matchEl.appendChild(buildMatchRow(job));
      });
    }

    if (relatedJobs.length > 0) {
      var header2 = document.createElement('div');
      header2.className = 'match-section-header';
      header2.style.marginTop = '12px';
      header2.textContent = 'Related Occupations (Same SOC Group)';
      matchEl.appendChild(header2);

      relatedJobs.forEach(function (job) {
        matchEl.appendChild(buildMatchRow(job));
      });
    }

    // ── Veteran Occupation Context ─────────────────────────────────────────
    if (vetOcc) {
      drawVetOccPanel(mos, vetOcc);
    }
  }

  function buildMatchRow(job) {
    var row = document.createElement('div');
    row.className = 'match-row';

    var badgeClass = 'partial';
    if (job.match === 'Strong Match') badgeClass = 'strong';
    else if (job.match === 'Related')  badgeClass = 'related';

    row.innerHTML =
      '<div>' +
        '<div class="match-title">' + job.title + '</div>' +
        '<div class="match-salary">' +
          (job.median_annual_wage
            ? '$' + job.median_annual_wage.toLocaleString() + ' median salary'
            : 'Salary data unavailable') +
          (job.growth_pct != null ? ' &nbsp;·&nbsp; ' + job.growth_pct + '% growth' : '') +
        '</div>' +
      '</div>' +
      '<div class="badge ' + badgeClass + '">' + job.match + '</div>';
    return row;
  }

  function drawVetOccPanel(mos, vetOcc) {
    var el = document.getElementById('vet-occ-bars');
    if (!el) return;
    el.innerHTML = '';

    // Find which category this MOS's primary jobs fall into
    var mosSocGroups = {};
    mos.jobs.forEach(function (j) {
      if (j.soc_code) {
        var grp = j.soc_code.substring(0, 2);
        mosSocGroups[grp] = true;
      }
    });

    var highlightCategories = [];

    vetOcc.categories.forEach(function (cat) {
      var isMosCategory = cat.soc_groups.some(function (g) { return mosSocGroups[g]; });
      if (isMosCategory) highlightCategories.push(cat.label);

      var row = document.createElement('div');
      row.className = 'occ-bar-row';

      var pct = cat.pct;
      var barColor = isMosCategory ? cat.color : '#ddd';
      var labelColor = isMosCategory ? '#2c3e50' : '#888';

      row.innerHTML =
        '<div class="occ-bar-label" style="color:' + labelColor + ';font-weight:' + (isMosCategory ? '700' : '400') + '">' +
          cat.label + '</div>' +
        '<div class="occ-bar-track">' +
          '<div class="occ-bar-fill" style="width:' + pct + '%;background:' + barColor + '">' +
            '<span class="occ-bar-pct">' + (pct > 8 ? pct.toFixed(1) + '%' : '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="occ-bar-pct-outside">' + (pct <= 8 ? pct.toFixed(1) + '%' : '') + '</div>';
      el.appendChild(row);
    });

    var noteEl = document.getElementById('vet-occ-note');
    if (noteEl) {
      if (highlightCategories.length > 0) {
        noteEl.className = 'occ-highlight';
        noteEl.style.display = 'block';
        noteEl.textContent = mos.moc + ' skills align most with: ' + highlightCategories.join(', ') + '.';
      } else {
        noteEl.style.display = 'none';
      }
    }
  }

  function clearDisplay() {
    ['kpi-salary','kpi-growth','kpi-openings','kpi-matches',
     'info-branch','info-dod','info-paths'].forEach(function (id) {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('career-bars').innerHTML    = '<div class="loading">Select an MOS above</div>';
    document.getElementById('career-matches').innerHTML = '<div class="loading">Select an MOS above</div>';
    var el = document.getElementById('vet-occ-bars');
    if (el) el.innerHTML = '<div class="loading">Select an MOS above</div>';
  }

})();
