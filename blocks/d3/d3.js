Bengine.extensibles.d3lib = new function D3lib() {
	this.type = "d3lib";
	this.name = "d3";
	this.category = "text";
	this.upload = false;
	this.accept = null;

	var thisBlock = this;
	var _private = {};
	
	_private.blocklimit = 2047;
	
	/*
		private methods
	*/
	
	var renderRCSS = function(css,sid) {
		let styleblock;
		try {
			styleblock = document.getElementById(sid);
		} catch(err) {
			// ignore, just an id doesn't exist err
		} finally {
			if(!styleblock) {
				styleblock = document.createElement('style');
				styleblock.setAttribute("id", sid);
				document.getElementsByTagName('head')[0].appendChild(styleblock);
			}
		}
		
		/* render css */
		styleblock.innerHTML = css;
	};
	
	var renderD3 = function(block) {
		block.childNodes[0].innerHTML = '';
		try {
			var element = d3.select(block.children[0]);
			var data = d3.tsvParse(block.childNodes[2].textContent);
			var width = 736;
			var height = 450;
			
			let sid = block.childNodes[1].getAttribute('data-sid');
			var renderCSS = function(css) {
				return renderRCSS(css,sid);
			}
			
			eval(block.childNodes[1].children[0].CodeMirror.getValue());
		} catch(err) {
			block.childNodes[0].innerHTML = String(err);
		}
	};
	
	this.destroy = function() {
		try {
			var style = document.getElementById(_private.sid);
			style.parentNode.removeChild(style);
		} catch(err) {
			// just ignore, couldn't find tag, probably block hasn't been run yet
		}
		return;
	};
	
	this.fetchDependencies = function() {
		var d3 = {
			inner: '',
			integrity: '',
			source: 'https://d3js.org/d3.v5.min.js',
			type: 'text/javascript',
			wait: 'd3'
		};
		var cmjs = {
			inner: '',
			source: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.24.2/codemirror.min.js',
			type: 'text/javascript',
			wait: 'CodeMirror'
		};
		
		return [d3,cmjs];
	};

	this.insertContent = function(block,bcontent) {		
		
		var d3Block = document.createElement("div");
		d3Block.setAttribute("class", "xD3");
		
		let sid = thisBlock.p.createUUID();
		d3Block.setAttribute('data-sid',sid);
		_private.sid = sid;
		
		var text = "";
		var data = "";		
		if(thisBlock.p.emptyObject(bcontent)) {
			if(thisBlock.d.options.defaultText) {
				text = `/* You are given 4 variables to work with:
data - your data as an array of objects
element - the d3 selection of an svg, run d3 methods on it
width - use the preset width value
height - use the preset height value
*/

// all data is imported as Strings, so convert to types as needed:
var data = data.map(function(x) {
  x.frequency = +x.frequency;
  return x;
});

// the code below generates a bar graph based on the data
// for more examples visit: academic.systems/bengine-d3
var g = element.append("g")
    .attr("transform", "translate(40,20)");

var x = d3.scaleBand().rangeRound([0, width]).padding(0.1),
    y = d3.scaleLinear().rangeRound([height, 0]);

x.domain(data.map(function(d) { return d.letter; }));
y.domain([0, d3.max(data, function(d) { return d.frequency; })]);

g.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));

g.append("g")
    .attr("class", "axis axis--y")
    .call(d3.axisLeft(y).ticks(10, "%"))
  .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 6)
    .attr("dy", "0.71em")
    .attr("text-anchor", "end")
    .text("Frequency");

g.selectAll(".bar")
  .data(data)
  .enter().append("rect")
    .attr("class", "bar")
    .attr("x", function(d) { return x(d.letter); })
    .attr("y", function(d) { return y(d.frequency); })
    .attr("width", x.bandwidth())
    .attr("height", function(d) { return height - y(d.frequency); });

// define any css your svg needs
renderCSS(\`
.bar {
  fill: steelblue;
}

.bar:hover {
  fill: brown;
}

.axis--x path {
  display: none;
}
\`);
`;
data = `letter	frequency
A	.08167
B	.01492
C	.02782
D	.04253
E	.12702
F	.02288
G	.02015
H	.06094
I	.06966
J	.00153
K	.00772
L	.04025
M	.02406
N	.06749
O	.07507
P	.01929
Q	.00095
R	.05987
S	.06327
T	.09056
U	.02758
V	.00978
W	.02360
X	.00150
Y	.01974
Z	.00074`;
			}
		} else {
			text = bcontent['content'];
			data = bcontent['data'];
		}
		
		var CodeMirrorBlock = CodeMirror(d3Block,{
		    value: text,
		    mode:  "javascript",
		    lineNumbers: true,
		    lineWrapping: true
		});
		CodeMirrorBlock.setSize('100%','auto');

		/* set limit function on keydown event */
		function setLimit(block,event) {
			if(event.keyCode !== 8 && block.innerText.length > _private.blocklimit) {
				event.preventDefault();
			}
		}

		if (CodeMirrorBlock.addEventListener) {
			CodeMirrorBlock.addEventListener("keydown",setLimit.bind(null,block),false);
		} else if (CodeMirrorBlock.attachEvent) {
			CodeMirrorBlock.attachEvent("onkeydown",setLimit.bind(null,block));
		} else {
			CodeMirrorBlock.onkeydown = setLimit.bind(null,block);
		}

		/* set limit on paste */
		CodeMirrorBlock.onpaste = function(event) {
			var ptext;
			if (window.clipboardData && window.clipboardData.getData) {
				ptext = window.clipboardData.getData('Text');
			} else if (event.clipboardData && event.clipboardData.getData) {
				ptext = event.clipboardData.getData('text/plain');
			}

			if((this.innerText.length + ptext.length) > _private.blocklimit) {
				return false;
			}
			return true;
		};

		var d3Preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		d3Preview.setAttribute('class','d3Image');
		d3Preview.setAttribute("viewBox", "0 0 800 500");
		d3Preview.setAttribute("preserveAspectRatio","");
		
		var d3Data = document.createElement("code");
		d3Data.setAttribute("class", "xD3-code");
		d3Data.contentEditable = true;
		d3Data.innerHTML = data;
		
		block.appendChild(d3Preview);
		block.appendChild(d3Block);
		block.appendChild(d3Data);

		return block;
	};

	this.afterDOMinsert = function(bid,data) {
		renderD3(document.getElementById(bid));
		document.getElementById(bid).children[1].children[0].CodeMirror.refresh();
	};
	
	this.runBlock = function(bid) {
		renderD3(document.getElementById(bid));
	};
	
	this.runData = function(data,iframe) {
		//// needs implementing
		return null;
	};

	this.saveContent = function(bid) {
		let content = document.getElementById(bid).children[1].children[0].CodeMirror.getValue();
		let data = document.getElementById(bid).children[2].textContent;
		return {'content':content,'data':data};
	};
	
	this.saveFile = null;

	this.showContent = function(block,bcontent) {
		var d3Block = document.createElement('div');
		d3Block.setAttribute('class','xD3');
		d3Block.setAttribute('style','display:none;visibility:hidden;');
		
		var CodeMirrorBlock = CodeMirror(d3Block,{
		    value: bcontent['content'],
		    mode:  "javascript",
		    lineNumbers: true,
		    lineWrapping: true
		});
		CodeMirrorBlock.setSize('100%','auto');

		var d3Preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		d3Preview.setAttribute('class','d3Image');
		d3Preview.setAttribute("viewBox", "0 0 800 500");
		d3Preview.setAttribute("preserveAspectRatio","");
		
		var d3Data = document.createElement("code");
		d3Data.setAttribute("class", "xD3-code");
		d3Data.setAttribute('style','display:none;visibility:hidden;');
		d3Data.contentEditable = true;
		d3Data.innerHTML = bcontent['data'];

		block.appendChild(d3Preview);
		block.appendChild(d3Block);
		block.appendChild(d3Data);
		
		renderD3(block);

		return block;
	};

	this.styleBlock = function() {
		var stylestr = `.xD3 {
			min-height: 62px;
			height: auto;
			
			border: 1px solid black;
			border-radius: 2px;
			background-color: white;
		}

		.xD3-code {
			white-space: pre-line;
			display: inline-block;
			width: 100%;
			min-height: 62px;
			height: auto;
			max-height: 218px;
			border: 1px solid black;
			border-radius: 2px;
			background-color: white;
			line-height: 1.8em;
			word-wrap: break-word;
			overflow-x:hidden;
			overflow-y:scroll;
			background-size: 100% 50px;
			padding: 4px 6px;
			margin: 0px;
			box-sizing: border-box;
		}

		.d3Image, .d3Image-show {
			display: flex;
			width: 100%;
			height: auto;
			min-height: 38px;
			border: 1px solid black;
			background-color: white;
			margin: 0px;
			box-sizing: border-box;
		}`;
		
		stylestr += `.CodeMirror{font-family:monospace;height:300px;color:#000}.CodeMirror-lines{padding:4px 0}.CodeMirror pre{padding:0 4px}.CodeMirror-gutter-filler,.CodeMirror-scrollbar-filler{background-color:#fff}.CodeMirror-gutters{border-right:1px solid #ddd;background-color:#f7f7f7;white-space:nowrap}.CodeMirror-linenumber{padding:0 3px 0 5px;min-width:20px;text-align:right;color:#999;white-space:nowrap}.CodeMirror-guttermarker{color:#000}.CodeMirror-guttermarker-subtle{color:#999}.CodeMirror-cursor{border-left:1px solid #000;border-right:none;width:0}.CodeMirror div.CodeMirror-secondarycursor{border-left:1px solid silver}.cm-fat-cursor .CodeMirror-cursor{width:auto;border:0!important;background:#7e7}.cm-fat-cursor div.CodeMirror-cursors{z-index:1}.cm-animate-fat-cursor{width:auto;border:0;-webkit-animation:blink 1.06s steps(1) infinite;-moz-animation:blink 1.06s steps(1) infinite;animation:blink 1.06s steps(1) infinite;background-color:#7e7}@-moz-keyframes blink{50%{background-color:transparent}}@-webkit-keyframes blink{50%{background-color:transparent}}@keyframes blink{50%{background-color:transparent}}.cm-tab{display:inline-block;text-decoration:inherit}.CodeMirror-rulers{position:absolute;left:0;right:0;top:-50px;bottom:-20px;overflow:hidden}.CodeMirror-ruler{border-left:1px solid #ccc;top:0;bottom:0;position:absolute}.cm-s-default .cm-header{color:#00f}.cm-s-default .cm-quote{color:#090}.cm-negative{color:#d44}.cm-positive{color:#292}.cm-header,.cm-strong{font-weight:700}.cm-em{font-style:italic}.cm-link{text-decoration:underline}.cm-strikethrough{text-decoration:line-through}.cm-s-default .cm-keyword{color:#708}.cm-s-default .cm-atom{color:#219}.cm-s-default .cm-number{color:#164}.cm-s-default .cm-def{color:#00f}.cm-s-default .cm-variable-2{color:#05a}.cm-s-default .cm-variable-3{color:#085}.cm-s-default .cm-comment{color:#a50}.cm-s-default .cm-string{color:#a11}.cm-s-default .cm-string-2{color:#f50}.cm-s-default .cm-meta,.cm-s-default .cm-qualifier{color:#555}.cm-s-default .cm-builtin{color:#30a}.cm-s-default .cm-bracket{color:#997}.cm-s-default .cm-tag{color:#170}.cm-s-default .cm-attribute{color:#00c}.cm-s-default .cm-hr{color:#999}.cm-s-default .cm-link{color:#00c}.cm-invalidchar,.cm-s-default .cm-error{color:red}.CodeMirror-composing{border-bottom:2px solid}div.CodeMirror span.CodeMirror-matchingbracket{color:#0f0}div.CodeMirror span.CodeMirror-nonmatchingbracket{color:#f22}.CodeMirror-matchingtag{background:rgba(255,150,0,.3)}.CodeMirror-activeline-background{background:#e8f2ff}.CodeMirror{position:relative;overflow:hidden;background:#fff}.CodeMirror-scroll{overflow:scroll!important;margin-bottom:-30px;margin-right:-30px;padding-bottom:30px;height:100%;outline:0;position:relative}.CodeMirror-sizer{position:relative;border-right:30px solid transparent}.CodeMirror-gutter-filler,.CodeMirror-hscrollbar,.CodeMirror-scrollbar-filler,.CodeMirror-vscrollbar{position:absolute;z-index:6;display:none}.CodeMirror-vscrollbar{right:0;top:0;overflow-x:hidden;overflow-y:scroll}.CodeMirror-hscrollbar{bottom:0;left:0;overflow-y:hidden;overflow-x:scroll}.CodeMirror-scrollbar-filler{right:0;bottom:0}.CodeMirror-gutter-filler{left:0;bottom:0}.CodeMirror-gutters{position:absolute;left:0;top:0;min-height:100%;z-index:3}.CodeMirror-gutter{white-space:normal;height:100%;display:inline-block;vertical-align:top;margin-bottom:-30px}.CodeMirror-gutter-wrapper{position:absolute;z-index:4;background:0 0!important;border:none!important;-webkit-user-select:none;-moz-user-select:none;user-select:none}.CodeMirror-gutter-background{position:absolute;top:0;bottom:0;z-index:4}.CodeMirror-gutter-elt{position:absolute;cursor:default;z-index:4}.CodeMirror-lines{cursor:text;min-height:1px}.CodeMirror pre{-moz-border-radius:0;-webkit-border-radius:0;border-radius:0;border-width:0;background:0 0;font-family:inherit;font-size:inherit;margin:0;white-space:pre;word-wrap:normal;line-height:20px;color:inherit;z-index:2;position:relative;overflow:visible;-webkit-tap-highlight-color:transparent;-webkit-font-variant-ligatures:contextual;font-variant-ligatures:contextual}.CodeMirror-wrap pre{word-wrap:break-word;white-space:pre-wrap;word-break:normal}.CodeMirror-linebackground{position:absolute;left:0;right:0;top:0;bottom:0;z-index:0}.CodeMirror-linewidget{position:relative;z-index:2;overflow:auto}.CodeMirror-code{outline:0}.CodeMirror-gutter,.CodeMirror-gutters,.CodeMirror-linenumber,.CodeMirror-scroll,.CodeMirror-sizer{-moz-box-sizing:content-box;box-sizing:content-box}.CodeMirror-measure{position:absolute;width:100%;height:0;overflow:hidden;visibility:hidden}.CodeMirror-cursor{position:absolute;pointer-events:none}.CodeMirror-measure pre{position:static}div.CodeMirror-cursors{visibility:hidden;position:relative;z-index:3}.CodeMirror-focused div.CodeMirror-cursors,div.CodeMirror-dragcursors{visibility:visible}.CodeMirror-selected{background:#d9d9d9}.CodeMirror-focused .CodeMirror-selected,.CodeMirror-line::selection,.CodeMirror-line>span::selection,.CodeMirror-line>span>span::selection{background:#d7d4f0}.CodeMirror-crosshair{cursor:crosshair}.CodeMirror-line::-moz-selection,.CodeMirror-line>span::-moz-selection,.CodeMirror-line>span>span::-moz-selection{background:#d7d4f0}.cm-searching{background:#ffa;background:rgba(255,255,0,.4)}.cm-force-border{padding-right:.1px}@media print{.CodeMirror div.CodeMirror-cursors{visibility:hidden}}.cm-tab-wrap-hack:after{content:''}span.CodeMirror-selectedtext{background:0 0}`;
		
		return stylestr;
	};
};
