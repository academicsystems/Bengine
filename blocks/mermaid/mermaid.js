Bengine.extensibles.merjs = new function MermaidJS() {
	this.type = "merjs";
	this.name = "mermaid";
	this.category = "text";
	this.upload = false;
	this.accept = null;
	
	var thisBlock = this; // it's helpful to keep a reference to this object
	var _private = {}; // attach private methods to this
	
	this.destroy = function(bid) {};
	
	this.fetchDependencies = function() {
		return [{
	    source: 'https://unpkg.com/mermaid@8.0.0-beta.9/dist/mermaid.min.js',
	    type: 'application/javascript',
	    integrity: null,
	    inner: '',
	    wait: ''
	  }];
	};
	
	this.insertContent = function(block,content) {
	  var xpreview = document.createElement("div");
	  xpreview.setAttribute("class","xMermaid-show");
	  
		var xtarea = document.createElement("textarea");
		xtarea.setAttribute("class","xMermaid");
		
		if(thisBlock.p.emptyObject(content)) {
			xtarea.value = `sequenceDiagram
A->> B: Query
B->> C: Forward query
C->> B: Response
B->> A: Forward response

%% for instructions, go here: https://mermaidjs.github.io/flowchart.html`;
		} else {
			xtarea.value = content;
		}
	
		block.appendChild(xpreview);
		block.appendChild(xtarea);
	
		return block;
	};
	
	this.afterDOMinsert = function(bid,data) {
	  mermaid.parseError = function(err,hash) {
	     console.log(err,hash);
	  };
	  
		var show = document.getElementById(bid).children[0];
		var editor = document.getElementById(bid).children[1];
		
		show.innerHTML = editor.value;
		mermaid.init({}, show);
		show.children[0].style = '';
	};
	
	this.runBlock = function(bid) {
		var show = document.getElementById(bid).children[0];
		var editor = document.getElementById(bid).children[1];
		
		show.removeAttribute('data-processed');
		show.innerHTML = editor.value;
		mermaid.init({}, show);
	};
	
	this.runData = null;
	
	this.saveContent = function(bid) {
		var textstr = document.getElementById('bengine-a' + bid).children[1].value;
		return textstr;
	};
	
	this.saveFile = null;
	
	this.showContent = function(block,content) {
		var xpreview = document.createElement("div");
		xpreview.setAttribute("class","xMermaid-show");
	  
		var xtarea = document.createElement("textarea");
		xtarea.setAttribute("class","xMermaid");
		xtarea.style = "visibility:hidden;display:none";
		
		try {
			xtarea.value = content['content'];
		} catch(err) {
			console.log(err);
		}
	
		block.appendChild(xpreview);
		block.appendChild(xtarea);
	
		return block;
	};
	
	this.styleBlock = function() {
	    var stylestr = `
	    .xMermaid {
		    height: 200px;
		}
	    
	    .xMermaid, .xMermaid-show {
	    	display: block;
	    	overflow-y: auto;
	    	width: 100%;
	    	
	    	border: 1px solid black;
	    	border-radius: 2px;
	    	background-color: white;
	
	    	padding: 8px;
	    	margin: 0px;
	    	box-sizing: border-box;
	
	    	font-family: Arial, Helvetica, sans-serif;
	    	font-size: 1em;
	    	font-weight: 300;
	    	color: black;
	
	        resize: none;
	    }
	
	    .xMermaid-show {
	    	padding: 8px;
			overflow-y: hidden;
			height: 400px;
	    }
	    `;
	
	    return stylestr;
	};
};