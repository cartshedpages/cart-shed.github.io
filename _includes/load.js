function include(file) {
    let script = document.createElement('script');
    script.src = file;
    script.type = 'text/javascript';
    script.defer = true;

    document.getElementsByTagName('head').item(0).appendChild(script);
}

/* Include Many js files */
include('/static/js/wr0100.js');
include('https://images.cart-shed.com/static/js/canvas_view.min.js');
include('https://images.cart-shed.com/static/js/gallery_view.min.js');


