/**
 * Motion — the small amount of it this site uses.
 *
 *   TRHMotion.skeletons(node, shape, count)  what is coming, while it loads
 *   TRHMotion.reveal(nodes)                  settle cards in as they appear
 *   TRHMotion.readingProgress(article)       how far down a long note you are
 *
 * Every one of these degrades to "the content is simply there". If the
 * browser is old, if IntersectionObserver is missing, or if the reader has
 * asked for reduced motion, nothing animates and nothing is hidden. That
 * order matters: a reveal that fails closed leaves a blank page.
 */
(function () {
  'use strict';

  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function line(extra) {
    return el('div', { class: 'skeleton skeleton-line' + (extra ? ' ' + extra : '') });
  }

  /**
   * Fills `node` with placeholders shaped like the real thing. Shapes match
   * the cards they stand in for, so when the content arrives it lands in the
   * space already held rather than pushing the page around.
   */
  function skeletons(node, shape, count) {
    node.innerHTML = '';
    node.setAttribute('aria-busy', 'true');

    for (var i = 0; i < (count || 3); i++) {
      var parts = shape === 'thread'
        ? [line('skeleton-line--meta'), line('skeleton-line--title'), line('skeleton-line--short')]
        : [line('skeleton-line--meta'), line('skeleton-line--title'), line(), line('skeleton-line--short')];
      node.appendChild(el('div', { class: 'skeleton-card' }, parts));
    }
  }

  /**
   * Ten pixels and a fade as each card comes into view. The stagger is capped
   * so the fifteenth card in a list is not still waiting its turn, and every
   * card is shown outright if there is no observer to tell us when it arrives.
   */
  function reveal(nodes) {
    var items = Array.prototype.slice.call(nodes || []);
    if (!items.length) return;

    if (still || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('reveal', 'is-in'); });
      return;
    }

    items.forEach(function (n, i) {
      n.classList.add('reveal');
      n.style.transitionDelay = Math.min(i, 4) * 60 + 'ms';
    });

    function show(n) {
      n.classList.add('is-in');
      n.style.transitionDelay = '';
    }

    var waiting = items.slice();

    /**
     * Anything at or above the fold is shown outright rather than watched.
     * An observer only speaks when something crosses the viewport edge, and
     * a reader can easily arrive already past a card — a reload that restores
     * the scroll position, a jump to an anchor, the back button. Nothing
     * crosses, so nothing fires, and the card would sit at opacity zero.
     */
    function sweep() {
      waiting = waiting.filter(function (n) {
        if (n.getBoundingClientRect().top >= window.innerHeight) return true;
        show(n);
        return false;
      });
      if (!waiting.length) stop();
    }

    /**
     * The observer is the efficient path, but it is not the only one. Scroll
     * is the belt to its braces: if the observer is throttled, or never fires
     * at all, whatever reaches the viewport is still shown. Content that
     * hides itself must not depend on one mechanism behaving.
     */
    var watcher = null;
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; sweep(); });
    }

    function stop() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (watcher) watcher.disconnect();
    }

    if ('IntersectionObserver' in window) {
      watcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting && entry.boundingClientRect.bottom >= 0) return;
          show(entry.target);
          waiting = waiting.filter(function (n) { return n !== entry.target; });
          watcher.unobserve(entry.target);
        });
        if (!waiting.length) stop();
      }, { rootMargin: '0px 0px -40px 0px' });

      items.forEach(function (n) { watcher.observe(n); });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    /**
     * Measuring once is not enough. A card can be below the fold at the moment
     * it is created and above it a frame later, as the paragraphs above settle,
     * a web font swaps in, or a picture finally arrives and changes a height.
     * Nothing scrolled, so nothing asked again, and it would stay hidden while
     * sitting in plain view. Checking on the way out of the current frame and
     * once more after the page has finished loading costs nothing and closes
     * that gap.
     */
    sweep();
    window.requestAnimationFrame(sweep);
    setTimeout(sweep, 300);
    if (document.readyState !== 'complete') {
      window.addEventListener('load', sweep, { once: true });
    }
  }

  /** Marks a reply as newly posted, so you can see where yours landed. */
  function landed(node) {
    if (!node || still) return;
    node.classList.add('is-new');
    setTimeout(function () { node.classList.remove('is-new'); }, 2600);
  }

  /**
   * A hairline across the top showing how far through the note you are.
   * Measured against the article, not the window, so the footer does not
   * count as reading.
   */
  function readingProgress(article) {
    if (!article || still) return;

    var bar = el('div', { class: 'read-progress', 'aria-hidden': 'true' });
    document.body.appendChild(bar);

    var ticking = false;
    function draw() {
      ticking = false;
      var box = article.getBoundingClientRect();
      var scrollable = box.height - window.innerHeight;
      if (scrollable <= 0) { bar.style.transform = 'scaleX(0)'; return; }
      var through = Math.min(Math.max(-box.top / scrollable, 0), 1);
      bar.style.transform = 'scaleX(' + through + ')';
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(draw);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    draw();
  }

  /**
   * Pages built from plain HTML opt in by putting data-reveal on a container;
   * its children then settle in exactly as the cards the API builds do. An
   * attribute rather than a class so it is obvious in the markup that this is
   * a behaviour and not a style, and so nothing is hidden unless this script
   * is actually here to show it again.
   */
  function wire() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (group) {
      reveal(group.children);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.TRHMotion = {
    skeletons: skeletons,
    reveal: reveal,
    landed: landed,
    readingProgress: readingProgress,
    still: still,
  };
})();
