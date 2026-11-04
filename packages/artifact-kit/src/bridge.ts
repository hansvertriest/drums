/**
 * Runs inside the artifact's iframe, next to agent-written code, and reports control
 * values to the app. Plain JavaScript in a string because the iframe loads nothing.
 */
export const bridgeScript = `(function () {
  var host = window.parent;
  var defaults = {};
  var readOnly = false;
  var selector = 'input[name],select[name],textarea[name]';

  function controls(name) {
    return Array.prototype.filter.call(document.querySelectorAll(selector), function (el) {
      return name === undefined || el.name === name;
    });
  }
  function names() {
    var seen = [];
    controls().forEach(function (el) { if (seen.indexOf(el.name) < 0) seen.push(el.name); });
    return seen;
  }
  function checkedValues(els) {
    return els.filter(function (el) { return el.checked; }).map(function (el) { return el.value; });
  }
  function isToggle(els) {
    return els.length === 1 && els[0].type === 'checkbox' && !els[0].hasAttribute('value');
  }
  function read(name) {
    var els = controls(name);
    var first = els[0];
    if (isToggle(els)) return first.checked ? 'yes' : 'no';
    if (first.type === 'radio' || first.type === 'checkbox') return checkedValues(els).join(', ');
    if (first.multiple) {
      return Array.prototype.filter.call(first.options, function (o) { return o.selected; })
        .map(function (o) { return o.value; }).join(', ');
    }
    return first.value;
  }
  function write(name, value) {
    var els = controls(name);
    if (!els.length) return;
    if (isToggle(els)) { els[0].checked = value === 'yes'; return; }
    if (els[0].type === 'radio' || els[0].type === 'checkbox') {
      var values = value.split(', ');
      els.forEach(function (el) { el.checked = values.indexOf(el.value) >= 0; });
      return;
    }
    if (els[0].multiple) {
      var selected = value.split(', ');
      Array.prototype.forEach.call(els[0].options, function (o) { o.selected = selected.indexOf(o.value) >= 0; });
      return;
    }
    els[0].value = value;
  }
  function label(name) {
    var box = controls(name)[0].closest('[data-label]');
    return (box && box.getAttribute('data-label')) || name;
  }
  function send(message) {
    message.source = 'drums-artifact';
    host.postMessage(message, '*');
  }
  function report() {
    if (readOnly) return;
    var changed = names().filter(function (name) { return read(name) !== defaults[name]; });
    send({
      type: 'answers',
      answers: changed.map(function (name) { return { name: name, label: label(name), value: read(name) }; }),
    });
  }
  function setChanges(on) {
    document.documentElement.classList.toggle('chg-on', !!on);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== host) return;
    var data = event.data;
    if (!data || data.source !== 'drums-host') return;
    if (data.type === 'changes') return setChanges(data.on);
    if (data.type !== 'init') return;
    readOnly = !!data.readOnly;
    (data.answers || []).forEach(function (a) { write(a.name, a.value); });
    setChanges(data.changes);
    if (readOnly) controls().forEach(function (el) { el.disabled = true; });
    report();
  });
  // The app's CSP stops a frame leaving, but that would leave it blank: keep links from trying.
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (link && link.getAttribute('href').charAt(0) !== '#') event.preventDefault();
  }, true);
  document.addEventListener('input', report, true);
  document.addEventListener('change', report, true);
  document.addEventListener('DOMContentLoaded', function () {
    names().forEach(function (name) { defaults[name] = read(name); });
    send({ type: 'ready' });
  }, true);
})();`;
