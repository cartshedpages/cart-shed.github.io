/*
   Document:      wr.js
   Date started:  06Oct2014
   By:            Roland Whitehead
   Purpose:       Provide basic js functionality to windsorrocker.com
   Requires:      Nothing just yet
   Copyright:     WIndsor Rocker Company
   
   Last Changed:  $Date$ $Rev$ by $Author$
   
   Notable modifications:
   Date       By    Details
   =========  ====  ============================================================
   05Jul2024  RW    New
 */

/**** Private interface ****/

function is_touch_device() {  
    try {  
        document.createEvent("TouchEvent");  
        return true;  
    } catch (e) {  
        return false;  
    }  
}

function wrAddEventListener(el, eventName, handler) {
    /* Function to add events post DOM load */
    if (el != null) {
        if (el.addEventListener) {
            el.addEventListener(eventName, handler);
        } else {
            el.attachEvent('on' + eventName, function(){
                handler.call(el);
            });
        }
    }
    return false;
}

function wrRemoveEventListener(el, eventName, handler) {
/* Function to add events post DOM load */
    if (el != null) {
        if (el.removeEventListener) {
            el.removeEventListener(eventName, handler, false);
        } else {
            el.detachEvent('on' + eventName, handler);
        }
    }
    return false;
}


function selectMenus(theMenus) {
// Function to add class 'selected' to current menu items
    /* var noOfMenus = theMenus.length;
     * for (var i = 0; i < noOfMenus; i++) {
     *     var el=document.getElementById(theMenus[i]);
     *     if (el.classList)
     *         el.classList.add('selected');
     *     else
     *         el.className += ' ' + 'selected';
     * }
     * return false; */
}

function showById(el_id){
    var el = document.getElementById(el_id);
    if (el != null) {
        if (el.classList)
            el.classList.add('show');
        else
            el.className += ' ' + 'show';
    }
    else {
        alert(el_id + 'was not found');
    }
    return false;
}

function hideById(el_id){
    var el = document.getElementById(el_id);
    if (el != null ) {
        if (el.classList)
            el.classList.remove('show');
        else
            el.show = el.show.replace(new RegExp('(^|\\b)' + show.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
    }
    else {
        alert(el_id + ' was not found');
    }
    return false;
}

function toggleById(el_id){
    var el = document.getElementById(el_id);
    if (el != null ) {
        el.classList.toggle('show');
    }
    else {
        alert(el_id + ' was not found');
    }
    return false;
}

function show_nav(e){
    e.stopPropagation();
    showById('nav');
    /*var el = document.getElementById('nav');
    if (el != null ) {
        el.classList.add('show');
    }
    else {
        alert(el_id + ' was not found');
    }*/
    var b = document.body; 
    if (b != null) {
        wrAddEventListener(b, 'click', hide_nav);
    }
    return false;
}

function hide_nav(e){
    e.stopPropagation();
    // hideById('menu_work_sub');
    hideById('nav');
    /*var el = document.getElementById('nav');
    if (el != null ) {
        el.classList.remove('show');
    }
    else {
        alert(el_id + ' was not found');
    }*/
    var b = document.body;
    if (b != null) {
        wrRemoveEventListener(b, 'click', hide_nav);
    }
    return false;
}


function goToUrl(addr){
    if (addr != null ) {
        window.location=addr;
    }
    return false;
}

function selectOption(id, valueToSelect) {    
    let element = document.getElementById(id);
    element.value = valueToSelect;
}

/* setup zoomer */
QU.whenReady(function() {

     // Zoomer/gallery options and events
     var viewer_opts = { showcontrols: 'yes' };
     var gallery_opts = { viewer: viewer_opts };
     var events = {};

     // Init image zoomer/gallery
     if (document.getElementsByClassName('gallery_image').length > 1) {
         gallery_view_init_all_fullscreen('gallery_image', gallery_opts, events);
     }
     else {
         canvas_view_init_all_images('gallery_image', viewer_opts, events);
     }
 });

function ready(fn) {
    if (document.addEventListener) {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        document.attachEvent('onreadystatechange', function() {
            if (document.readyState === 'interactive')
                fn();
        });
    }
}

ready(function() {

    if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)) {
        /* browser with either Touch Events of Pointer Events running on touch-capable device */
        var b = document.getElementsByTagName('body');
        if (b.length > 0) {
            if (b[0].classList) {
                b[0].classList.add('touch');
            } else {
                b[0].className += ' ' + 'touch';
                 }
        }
        wrAddEventListener(document.getElementById('show_nav'), 'click', show_nav);
        wrAddEventListener(document.getElementById('show_nav'), 'touchend', show_nav);
    } else {
        wrAddEventListener(document.getElementById('show_nav'), 'click', show_nav);
        wrAddEventListener(document.getElementById('show_nav'), 'touchend', show_nav);
    }
});

