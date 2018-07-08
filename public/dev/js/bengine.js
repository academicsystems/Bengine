/* eslint-env browser, es6 */

/*** Title: Block Engine ***/

/*
	options	(object,null)		configuration options
	extensions (object,null)	holds libraries that extend Bengine
	
	_public
		variables				generated variables
		
		loadBlocksEdit			load block data in edit mode
		loadBlocksShow			load block data in show mode for Bengine
		loadQuizShow			load block data in show mode for Qengine
		createQengineFile		opens new page with Qengine File of blocks
	
	_private
		options					configuration options
		categoryCounts			number of extensibles in each category
		extensibles				holds the extensible objects
		engineID				DOM id of div used to show blocks
		pagePath				Directory location for file saves and assets
		
		blockMethod				methods for handling block creation/deletion
		datahandler				methods for handling AJAX back-end data calls
		extAPI					methods that provide API to block extensibles
		helper					methods for helping other functions
	
	Bengine
		loadBlocks				function to dynamically retrieve blocks and dependencies
		setScriptPath			function to set path to Bengine files
	
	* file formats:
		Njn text format
			{%type:namespace:conditional
			    content
			%}
		Njn data format
			order : [namespace,...]
			blocks : [[type,content,conditional],...]
		Bengine Json format
			"types": [type,...]
			"content": [{data object},...]
		Bengine Page Data format
			[type,{data object},...]
*/
function Bengine(options,extensions) {
	
	/*** Section: Attributes ***/
	
	var _public = {};    // public Bengine
	var _protected = {}; // internal Bengine use and blocks can use
	var _private = {};   // private internal Bengine
	
	// initialize public generated variables
	_protected.variables = {};
	this.variables = _protected.variables;
	_protected.variables.qengine = {};
	_protected.variables.qengine.randomseed = Math.floor(Math.random() * 4294967296);
	
	// initialize options
	_protected.options = {};
	if(typeof options !== 'object') var coptions = {}; else var coptions = Object.assign({},options);
	_protected.options.blockLimit = coptions.blockLimit || 16;
	_protected.options.defaultText = (coptions.defaultText !== false);
	_protected.options.enableAutoSave = coptions.enableSave ||  false;
	_protected.options.enableSingleView = coptions.enableSingleView || false;
	_protected.options.localMode = coptions.localMode || false;
	_protected.options.mediaLimit = coptions.mediaLimit || 100; // mb
	_protected.options.mode = coptions.mode || 'bengine';
	_protected.options.playableMediaLimit = coptions.playableMediaLimit || 180; // seconds
	
	// initialize private variables
	_private.categoryCounts = {
		media:0,
		text:0,
		quiz:0,
		unknown:0
	};
	_private.contentPath = "/content/";
	_private.engineID = '';
	_private.pagePath = '';
	_private.quizData = {
		data:{}, // quizData, stored for processing later steps or reprocessing current step
		grade:null,
		stepConditional:"",
		stepCurrent:0, // index in data of current step
		stepNext:null, // index in data of next step, null=unknown, -1=no more steps
		submitData:{}, // stores form data submitted by student on quiz
		store:[]
	};
	_private.extState = {
		dependencies:{},
		styles:{}
	};
	
	// qengine blocks use these
	_protected.getEngineID = function() { return _private.engineID; };
	_protected.getPagePath = function() { return _private.pagePath; };
	_protected.getContentPath = function() { return _private.contentPath; };
	
	// initialize objects that will hold methods
	_private.blockMethod = {};
	_private.extAPI = {};
	_private.datahandler = {};
	_private.helper = {};
	
	/*** Section: Load Extensibles ***/
	
	// set and validate extensibles
	if(typeof Bengine.extensibles !== 'object') {
		throw Error("Bengine.extensibles must be an object.");
	}
	_private.extensibles = Object.assign({},Bengine.extensibles);
	
	var validExtAttr = [
		"type",
		"name",
		"category",
		"upload",
		"accept",
		"destroy",
		"fetchDependencies",
		"insertContent",
		"afterDOMinsert",
		"runBlock",
		"runData",
		"saveContent",
		"saveFile",
		"showContent",
		"styleBlock"
	];
	
	for(var prop in _private.extensibles)(function(prop) {
		var extensibleAttributes = Object.keys(_private.extensibles[prop]);
		
		// check that they have programmed only allowable methods
		validExtAttr.forEach(function(element) {
			if(!(extensibleAttributes.includes(element))) {
				_private.extensibles[prop][element] = null;
				console.warn("Bengine: " + prop + " has not implemented method: " + element);
			}
		});
		
		// count the extensible types
		if(_private.extensibles.hasOwnProperty(prop)) {
			switch(_private.extensibles[prop].category) {
				case "media":
					_private.categoryCounts.media++; break;
				case "text":
					_private.categoryCounts.text++; break;
				case "quiz":
					_private.categoryCounts.quiz++; break;
				default:
					throw new Error("Invalid Category In Extensibles");
			}
		}
		
		// add methods to the extensible
		_private.extensibles[prop].p = _private.extAPI;
		
		// add public Bengine attributes to extensible
		_private.extensibles[prop].d = _protected;
		
	})(prop);
	
	// create blank extensible for blocks that are unknown or couldn't be loaded
	_private.blockMethod.unknownBlock = function(type) {
		this.type = type;
		this.name = type;
		this.category = "unknown";
		this.upload = false;
		this.accept = null;
		
		this.destroy = function() {return null;}
		this.fetchDependencies = function() {return null;}
		this.insertContent = function(block,bcontent) {
			block.innerHTML = "<p class='bengine_unknown_block'>unknown block</p>";
			return block;
		}
		this.afterDOMinsert = function(bid,data) {return null;}
		this.runBlock = null;
		this.runData = function(data) {return null;}
		this.saveContent = function(bid) {return {};}
		this.showContent = function(block,bcontent) {
			block.innerHTML = "unknown block";
			return block;
		}
		this.styleBlock = function() {return '';}
	}
	
	/*** Section: Load Extensions ***/
	
	if(typeof extensions !== 'object') {
		extensions = {
			alerts:null,
			display:null
		};
	}
	
	// set and validate alerts
	if(typeof extensions.alerts !== 'object' || extensions.alerts === null) {
		_private.alerts = {
			alert: function(msg) { window.alert(msg); },
			confirm: function(msg) { window.confirm(msg); },
			log: function(msg,type) { 
				switch(type) {
					case undefined:
					case "log":
						console.log(msg); break;
					case "warn":
					case "warning":
						console.warn(msg); break;
					case "error":
						console.error(msg); break;
					default:
						console.log(msg);
				}
			}
		};
	} else {
		_private.alerts = Object.assign({},extensions.alerts);
	}
	
	var validAlertMethods = ["alert","confirm","log"];
	var alertMethods = Object.keys(_private.alerts);
	
	validAlertMethods.forEach(function(element) {
		if(!(alertMethods.includes(element))) {
			throw Error("Bengine: invalid alerts configuration. Missing method: " + element);
		}
	});
	
	// set and validate display
	if(typeof extensions.display !== 'function' || extensions.display === null) {
		_private.displayClass = function(engineID) {
			this.engineID = engineID;
		};
		_private.displayClass.prototype.progressFinalize = function() {};
		_private.displayClass.prototype.progressInitialize = function() {};
		_private.displayClass.prototype.progressUpdate = function() {};
		_private.displayClass.prototype.updateSaveStatus = function() {};
	} else {
		_private.displayClass = extensions.display;
	}
	
	var validDisplayMethods = ["progressFinalize","progressInitialize","progressUpdate","updateSaveStatus"];
	var displayMethods = Object.keys(_private.displayClass.prototype);

	validDisplayMethods.forEach(function(element) {
		if(!(displayMethods.includes(element))) {
			throw Error("Bengine: invalid display configuration in. Missing method: " + element);
		}
	});
	
	/*** Section: Start Up ***/
	
	// load styles
	(function() {
		// only load once
		if(document.getElementById('bengine-global-styles') !== null) {
			return;
		}
		
		var style = document.createElement('style');
		style.id = 'bengine-global-styles';
		style.type = 'text/css';
		style.innerHTML = `
.bengine-instance{height:100%}.bengine-block-style-embed{height:85vh!important;margin:0!important}.bengine-x-blocks{height:100%}.bengine-single-view{width:100%;height:15vh;position:absolute;bottom:0;right:0}.bengine-btn-embed{border:0;color:#000;float:left;width:100%;height:100%;padding:0 30px;text-align:center;cursor:pointer;transition:background-color .5s;touch-action:manipulation;font-size:1em;font-weight:400}.bengine-btn-color{background-color:#000;color:#fff;font-size:1.3em}.bengine-btn-color:hover{background-color:rgba(0,0,0,.6);color:#000}.bengine-block{margin:0;padding:0}.bengine-blockbtns{margin:50px auto 0 auto;position:relative}.bengine-blockbtn{color:#000;border:1px solid #000;width:100%;padding:6px 12px;text-align:center;cursor:pointer;transition:background-color .5s;touch-action:manipulation;font-size:1em;font-weight:400}.bengine-addbtn{background-color:#fff}.bengine-addbtn:hover{background-color:#d3d3d3}.bengine-delbtn{background-color:#ff1818}.bengine-delbtn:hover{background-color:#a81313}.bengine-x-ns-cond{padding:5px 8px;border:1px solid #000;display:inline-block;box-sizing:border-box;font-size:.9em}.bengine_unknown_block{display:inline-block;width:100%;height:32px;border:1px solid #fff;padding:6px 6px;margin:0;box-sizing:border-box;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:1em;font-weight:700;color:#fff;background-color:#000}.bengine-iframe{overflow:hidden}@media screen and (max-width:900px){.bengine-blockbtns{width:100%}.bengine-blockbtn{width:100%}}.col{box-sizing:border-box;position:relative;float:left;min-height:1px;height:100%}.col-1{width:1%}.col-2{width:2%}.col-3{width:3%}.col-4{width:4%}.col-5{width:5%}.col-6{width:6%}.col-7{width:7%}.col-8{width:8%}.col-9{width:9%}.col-10{width:10%}.col-11{width:11%}.col-12{width:12%}.col-13{width:13%}.col-14{width:14%}.col-15{width:15%}.col-16{width:16%}.col-17{width:17%}.col-18{width:18%}.col-19{width:19%}.col-20{width:20%}.col-21{width:21%}.col-22{width:22%}.col-23{width:23%}.col-24{width:24%}.col-25{width:25%}.col-26{width:26%}.col-27{width:27%}.col-28{width:28%}.col-29{width:29%}.col-30{width:30%}.col-31{width:31%}.col-32{width:32%}.col-33{width:33%}.col-34{width:34%}.col-35{width:35%}.col-36{width:36%}.col-37{width:37%}.col-38{width:38%}.col-39{width:39%}.col-40{width:40%}.col-41{width:41%}.col-42{width:42%}.col-43{width:43%}.col-44{width:44%}.col-45{width:45%}.col-46{width:46%}.col-47{width:47%}.col-48{width:48%}.col-49{width:49%}.col-50{width:50%}.col-51{width:51%}.col-52{width:52%}.col-53{width:53%}.col-54{width:54%}.col-55{width:55%}.col-56{width:56%}.col-57{width:57%}.col-58{width:58%}.col-59{width:59%}.col-60{width:60%}.col-61{width:61%}.col-62{width:62%}.col-63{width:63%}.col-64{width:64%}.col-65{width:65%}.col-66{width:66%}.col-67{width:67%}.col-68{width:68%}.col-69{width:69%}.col-70{width:70%}.col-71{width:71%}.col-72{width:72%}.col-73{width:73%}.col-74{width:74%}.col-75{width:75%}.col-76{width:76%}.col-77{width:77%}.col-78{width:78%}.col-79{width:79%}.col-80{width:80%}.col-81{width:81%}.col-82{width:82%}.col-83{width:83%}.col-84{width:84%}.col-85{width:85%}.col-86{width:86%}.col-87{width:87%}.col-88{width:88%}.col-89{width:89%}.col-90{width:90%}.col-91{width:91%}.col-92{width:92%}.col-93{width:93%}.col-94{width:94%}.col-95{width:95%}.col-96{width:96%}.col-97{width:97%}.col-98{width:98%}.col-99{width:99%}.col-100{width:100%}.col-1_1{width:100%}.col-1_2{width:50%}.col-1_3{width:33.33%}.col-2_3{width:66.66%}.col-1_4{width:25%}.col-1_5{width:20%}.col-1_6{width:16.66%}.col-1_7{width:14.28%}.col-1_8{width:12.5%}.col-1_9{width:11.11%}.col-1_10{width:10%}.col-1_11{width:9.09%}.col-1_12{width:8.33%}
		`;
		
		document.getElementsByTagName('head')[0].appendChild(style);
	})();
	
	/*** Section: Private Helper Methods ***/
	
	// used for tracking .onprogress events
	_private.helper.counter = function(reset) {
		if(typeof this.track === 'undefined' || this.track === 0) {
			this.track = 1;
			return 1;
		} else if(reset) {
			this.track = 0;
			return 0;
		} else {
			this.track++;
		}
		return this.track;
	};

	// keeps track of previous and current spots for media upload progress
	_private.helper.position = function(spot) {
		if(typeof this.prev === 'undefined') {
			/* initialize on first call */
			this.prev = 0;
			this.curr = spot;
		} else if (spot === 0) {
			/* reset */
			this.prev = 0;
			this.curr = 0;
		} else if (this.curr !== spot) {
			/* keep track of previous and current spot */
			this.prev = this.curr;
			this.curr = spot;
		}
		return [this.prev,this.curr];
	};
	
	// convert from Njn format to page data array for consumption of Bengine load functions
	_private.helper.convertNjnFormatToPageDataArray = function(blocks) {
  	var neededVars = {};
  	for (block of blocks.order) {
  		/* find used variables */
  		var re = /@@(.*?)@@/g;
      var matches;
      do {
			  matches = re.exec(blocks.blocks[block][1]);
        if (matches) {
				  let parts = matches[1].split('.');
				  if (!neededVars.hasOwnProperty(parts[0])) {
  				  neededVars[parts[0]] = {};
				  }
				  neededVars[parts[0]][parts[1]] = null;
				}
		  } while (matches);
		}
  	
		var pageData = [];
		for (block of blocks.order) {
			pageData.push(blocks.blocks[block][0]); // type
			
			if (neededVars.hasOwnProperty(block)) {
  			/* needed vars from this block was found */
  			pageData.push({
  				"content":blocks.blocks[block][1] ,
  				"namespace":block,
  				"conditional":blocks.blocks[block][2],
  				"vars":Object.keys(neededVars[block]).join('\n')
  			});
  		} else {
    		pageData.push({
				"content":blocks.blocks[block][1] ,
				"namespace":block,
				"conditional":blocks.blocks[block][2],
			});
  		}
		}
		
		return pageData;
	};
	
	// remove node
	_private.helper.emptyDiv = function(node) {
		if (typeof node === "object") {
			while (node.hasChildNodes()) {
				node.removeChild(node.lastChild);
			}
		}
	};
	
	// create url with path
	_private.helper.createURL = function(path) {	
		return window.location.origin + encodeURI(path);
	};
	
	function Blocks(text) {
		var _priv = {};
		var _pub = this;

		_priv.data = {
			cblock: '' // current block key in this.blocks
		};

		_pub.data = {
			blocks: {}, // bname -> [btype,bcontent,bcond]
			order: []  // ordered list of block keys
		};
		
		_priv.reset = function() {
			_priv.data = {cblock:''};
			_pub.data = {blocks:{},order:[]};	
		};

		_priv.parseOpen = function(line) {
			var splits = line.split('{%');
			if (splits.length > 1) {
				var bname;
				var btype;
				var bcond = null;
				var theRest = '';
				var parts = splits[1].split(':');
				if (parts.length > 2) {
					btype = parts[0];
					bname = parts[1];
					var lastParts = parts[2].split(/\s/g);
					bcond = lastParts[0];
					if (lastParts.length > 1) {
						theRest = lastParts[1];
					}
				} else if (parts.length > 1) {
					btype = parts[0];
					var lastParts = parts[1].split(/\s/g);
					bname = lastParts[0];
					if (lastParts.length > 1) {
						theRest = lastParts[1];
					}
				} else {
					throw 'Invalid Engine File';
				}
				_priv.createBlock(bname,btype,bcond);
				if (theRest) {
					_priv.parseClose(theRest);
				}
				return true;
			} else {
				return false;
			}
		};

		_priv.parseClose = function(line) {
			var splits = line.split('%}');
			if (splits.length > 1) {
				_priv.addToBlock(splits[0]);
				return !_priv.parseOpen(splits[1]);
			} else {
				_priv.addToBlock(line);
				return false;
			}
		};

		_priv.createBlock = function(bname,btype,bcond) {
			_pub.data.blocks[bname] = [btype,'',bcond];
			_pub.data.order.push(bname);
			_priv.data.cblock = bname;
		};

		_priv.addToBlock = function(line) {
			_pub.data.blocks[_priv.data.cblock][1] += line;
		};

		_pub.parseEngineFile = function(text) {
			_priv.reset();
			var bsearch = true;
			var lines = text.split(/(?<=\n)/);

			for (line of lines) {
				if (bsearch) {
					bsearch = !_priv.parseOpen(line);
				} else {
					bsearch = _priv.parseClose(line);
				}
			}
			
			return _pub.data;
		};
	};
	
	var Blocks = new Blocks();
	_private.helper.parseEngineFile = Blocks.parseEngineFile;
	
	_private.helper.retrieveResource = function(path) {
		var promise = new Promise(function(resolve,reject) {
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open("GET",_private.helper.createURL(path),true);
			xmlhttp.onreadystatechange = function() {
				if (xmlhttp.readyState === XMLHttpRequest.DONE) {
					switch(xmlhttp.status) {
						case 200:
							resolve({msg:'Success',status:200,data:{file:xmlhttp.responseText}}); break;
						case 404:
							reject({msg:'File Not Found',status:404,data:{}}); break;
						default:
							reject({msg:'Unknown Error',status:xmlhttp.status,data:{}});
					}
				}
			};
		
			xmlhttp.send();
		})
		
		return promise;
	}
	
	_private.helper.sleep = function(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
	
	/*** Section: API Block Methods ***/
	
	_private.extAPI.alerts = _private.alerts;
	
	_private.extAPI.checkConditional = function(data) {
		var runBool = true;
		if(data['conditional']) {
			cparts = data['conditional'].split(".");
			if(cparts[0] in _protected.variables) {
				if(cparts[1] in _protected.variables[cparts[0]]) {
					if(!_protected.variables[cparts[0]][cparts[1]]) {
						runBool = false;
					}
				} else {
					runBool = false;
				}
			} else {
				runBool = false;
			}
		}
		return runBool;
	};
	
	_private.extAPI.createUUID = function() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	};
	
	_private.extAPI.decodeHTML = (function() {
		var element = document.createElement('div');
		
		function decodeHTMLEntities (str) {
			if(str && typeof str === 'string') {
				element.innerHTML = str;
				str = element.textContent;
				element.textContent = '';
			}
		
			return str;
		}
		
		return decodeHTMLEntities;
	})();
	
	_private.extAPI.emptyObject = function(obj) {
		if(Object.keys(obj).length === 0 && obj.constructor === Object) {
			return true;
		}
		return false;
	};
	
	_private.extAPI.getLocalResource = function(filename,url) {
		var promise = new Promise(function(resolve,reject) {
			var xhr = new XMLHttpRequest();
	    	xhr.open('GET',window.location.origin + url);
	    	xhr.responseType = 'blob';
	    	
	    	xhr.onreadystatechange = function() {
				if(xhr.readyState === XMLHttpRequest.DONE) {
					if(xhr.status !== 200) {
						reject(url);
					} else {
						resolve(new File([xhr.response], filename));
					}
				}
			};
			
			xhr.send();
		});
		
		return promise;
	};
	
	_private.extAPI.getMediaFile = function(url,callback) {
		var xhr = new XMLHttpRequest();
        xhr.open('GET',url);
        xhr.responseType = 'arraybuffer';
		xhr.onload = callback;
        xhr.send();
	};
	
	_private.extAPI.getResourcePath = function(str) {
		let resource;
		let parts = str.split(/\.(.+)/).filter(function(el) {return el.length != 0});
		try {
			resource = _protected.variables[parts[0]][parts[1]];
		} catch(err) {
			/* resource does not exist */
		}
		
		if(typeof resource === 'undefined') {
			_private.alerts.log('Qengine resource not found: ' + str,'error');
		}
		
		return resource;
	};
	
	_private.extAPI.replaceVars = function(str) {
		let re = /@@(.*?)@@/g;
		
		var nstr = str;
		var allmatches = [];
		var matches;
		do {
			matches = re.exec(str);
			if (matches) {
				let parts = matches[1].split('.');
				let replacer;
				try {
					replacer = _protected.variables[parts[0]][parts[1]];
				} catch(err) {
					replacer = '';
					_private.alerts.log('Qengine variable not found: ' + matches[1],'error');
				}
				nstr = nstr.replace(matches[0],replacer);
			}
		} while (matches);
		
		return nstr;
	};
	
	_private.extAPI.sendData = function(path,data) {
		var promise = new Promise(function(resolve,reject) {
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open("POST",_private.helper.createURL(path),true);
			xmlhttp.setRequestHeader("Content-type","application/json");
			xmlhttp.onreadystatechange = function() {
				if (xmlhttp.readyState === XMLHttpRequest.DONE) {
					switch(xmlhttp.status) {
						case 500:
							reject({msg:'unknown',status:500,data:{}}); break;
						case 0:
							reject({msg:'unknown',status:0,data:{}}); break;
						case 200:
							resolve(JSON.parse(xmlhttp.responseText)); break;
						default:
							reject(JSON.parse(xmlhttp.responseText));
					}
				}
			};
		
			xmlhttp.send(JSON.stringify(data));
		})
		
		return promise;
	};
	
	/*** Section: Public Methods ***/
	
	/*
		blockData (array)[string,object,...] - block type & block content, repeated for every block
	*/
	_private.loadBlocksShowReady = async function(blockData) {	
		/* domid div */
		var mainDiv = document.getElementById(_private.engineID);
	
		if(mainDiv === 'undefined') {
			return -1;
		} else {
			mainDiv.innerHTML = "";
			mainDiv.style.height = "100%";
		}

		/* engine div */
		var enginediv;
		enginediv = document.createElement('div');
		enginediv.setAttribute('class','bengine-instance');
		enginediv.setAttribute('id','bengine-instance-' + _private.engineID);
		mainDiv.appendChild(enginediv);
	
		/* blocks */
		var blocksdiv = document.createElement('div');
		blocksdiv.setAttribute('class','bengine-x-blocks');
		blocksdiv.setAttribute('id','bengine-x-blocks-' + _private.engineID);
		blocksdiv.innerHTML = "<p style='color:white'>loading blocks...</p>";

		/* append blocks div to engine div */
		enginediv.appendChild(blocksdiv);
	
		/* append block styles */
		_private.blockMethod.blockStyle();
		
		/* append block dependencies */
		var waiting = _private.blockMethod.blockScripts();
		
		/* a list of dependency objects in 'waiting', we wait until all are loaded before moving on */
		for(let w = 0; w < waiting.length; w++) {
			var ctry = 0;
			var tries = 100;
			while(typeof window[waiting[w]] == "undefined") {
				if(ctry > tries) {
					console.log('Reached wait limit for script: ' + waiting[w]); break;
				}
				await _private.helper.sleep(100); // we can't continue until dependencies are loaded
				ctry++;
			}
		}
	
		var count = 0;
		var i = 1;
		var doubleBlockCount = blockData.length;

		blocksdiv.innerHTML = ''; // remove any loading screen
		while(count < doubleBlockCount) {
			/* create the block */
			var block = _private.blockMethod.generateBlock(i,blockData[count]);
			try {
				var retblock = _private.extensibles[blockData[count]].showContent(block,blockData[count + 1]);
			} catch(err) {
				let blockType = blockData[count];
				_private.alerts.alert("Missing Block Dependency: " + blockType + ". Check Console For More Information");
				throw err;
			}
	
			if(_protected.options.enableSingleView) {
				retblock.children[0].className += " bengine-block-style-embed";
			} else {
				retblock.children[0].className += " bengine-block-style";
			}
	
			/* create the block div */
			var group = document.createElement('div');
			group.setAttribute('class','bengine-block bengine-block-' + _private.engineID);
			group.setAttribute('id','bengine-' + _private.engineID + '-' + i);
	
			if(_protected.options.enableSingleView && i !== 1) {
				group.setAttribute('style','display:none;visibility:hidden;');
			}

			/* append group to blocks div */
			group.appendChild(retblock);
			blocksdiv.appendChild(group);
			
			/* do any rendering the block needs */
			_private.extensibles[blockData[count]].afterDOMinsert('bengine-a-' + _private.engineID + '-' + i,null);
	
			count += 2;
			i++;
		}

		if(_protected.options.enableSingleView) {
			function changeBlock(dir) {
				/* back:false, forward:true */
				var direction = -1;
				if(dir) {
					direction = 1;
				}
		
				var viewDiv = document.getElementById('bengine-currentBlock-' + _private.engineID);
				var viewStatus = Number(viewDiv.getAttribute('data-currentBlock'));
		
				var next = viewStatus + direction;
		
				var nextBlock = document.getElementById('bengine-' + _private.engineID + '-' + next);
				if(nextBlock !== null) {
					var currentBlock = document.getElementById('bengine-' + _private.engineID + '-' + viewStatus);
					currentBlock.setAttribute('style','display:none;visibility:hidden;');
		
					nextBlock.setAttribute('style','display:block;visibility:visible;');
		
					viewDiv.setAttribute('data-currentBlock',next);
				}
			}
			
			var singleViewBtnsDiv = document.createElement('div');
			singleViewBtnsDiv.setAttribute('id','bengine-single-view-' + _private.engineID);
			singleViewBtnsDiv.setAttribute('class','bengine-single-view');
	
			var btnBack = document.createElement('button');
			btnBack.setAttribute('class','bengine-btn-embed bengine-btn-color');
			btnBack.setAttribute('style','width: 50%;');
			btnBack.innerHTML = '&larr;';
			btnBack.onclick = function() {
				changeBlock(false);
			};
	
			var btnForward = document.createElement('button');
			btnForward.setAttribute('class','bengine-btn-embed bengine-btn-color');
			btnForward.setAttribute('style','width: 50%;');
			btnForward.innerHTML = '&rarr;';
			btnForward.onclick = function() {
				changeBlock(true);
			};
	
			var currentSingle = document.createElement('div');
			currentSingle.setAttribute('id','bengine-currentBlock-' + _private.engineID);
			currentSingle.setAttribute('data-currentBlock',1);
			currentSingle.setAttribute('style','display:none;visibility:hidden;');
	
			singleViewBtnsDiv.appendChild(btnBack);
			singleViewBtnsDiv.appendChild(btnForward);
			singleViewBtnsDiv.appendChild(currentSingle);
			enginediv.appendChild(singleViewBtnsDiv);
		}
	};
	
	/*
		engineID (string) - element id in DOM, Bengine blocks are displayed here
		pagePath (string) - directory location for file saves and assets, empty string -> front-end only mode
	*/
	_public.loadBlocksShow = function(engineID,pagePath,pageData = []) {
		/* validate data */		
		try {
			if(typeof engineID !== 'string') throw Error('Invalid engineID passed to loadBlocksShow()');
			if(typeof pagePath !== 'string') throw Error('Invalid pagePath passed to loadBlocksShow()');
			if(!Array.isArray(pageData)) throw Error('pageData must be array passed to loadBlocksShow()');
		} catch(err) {
			_private.alerts.alert(err.message);
			return -1;
		}
		
		pagePath = pagePath.replace(/^\/(.+)?\/$/g,"$1");
		
		/* initialize parameters */
		_private.engineID = engineID;
		_private.pagePath = pagePath;
		
		if(pageData.length < 1 && pagePath.length > 0) {
			var fpromise = _private.helper.retrieveResource(_private.contentPath + pagePath + "/bengine.json");
			fpromise.then(function(result) {
				dataObj = JSON.parse(result.data.file);
				rpageData = [];
				for(let i = 0; i < dataObj.types.length; i++) {
					rpageData.push(dataObj.types[i]);
					rpageData.push(dataObj.content[i]);
				}
				if(document.readyState !== "loading") {
					_private.loadBlocksShowReady(rpageData);
				} else {
					window.addEventListener('DOMContentLoaded', function() {
						_private.loadBlocksShowReady(rpageData);
					});
				}
			},function(error) {
				_private.alerts.alert("Error: " + error.msg + " Status: " + error.status);
			});
		} else {
			if(document.readyState !== "loading") {
				_private.loadBlocksShowReady(pageData);
			} else {
				window.addEventListener('DOMContentLoaded', function() {
					_private.loadBlocksShowReady(pageData);
				});
			}
		}
	};
	this.loadBlocksShow = _public.loadBlocksShow;
	
	/*
		blockData (array)[string,string,...] - block type & block content, repeated for every block
	
		(number) - block count
	*/
	_private.loadQuizShowReady = async function(pageData) {	
		
		/* this hack should be fixed later */
		var css = document.createElement('style');
		css.innerHTML = "body, html { height: 100%; }";
		document.getElementsByTagName('head')[0].appendChild(css);
		
		/* domid div */
		var mainDiv = document.getElementById(_private.engineID);
	
		if(mainDiv === 'undefined') {
			return -1;
		} else {
			mainDiv.innerHTML = "";
			mainDiv.style.height = "100%";
		}
	
		/* engine div */
		var enginediv;
		enginediv = document.createElement('div');
		enginediv.setAttribute('class','bengine-instance');
		enginediv.setAttribute('id','bengine-instance-' + _private.engineID);
		mainDiv.appendChild(enginediv);
	
		/* blocks */
		var blocksdiv = document.createElement('div');
		blocksdiv.setAttribute('class','bengine-x-blocks');
		blocksdiv.setAttribute('id','bengine-x-blocks-' + _private.engineID);
		blocksdiv.innerHTML = "<p style='color:white'>loading blocks...</p>";
	
		/* append blocks div to engine div */
		enginediv.appendChild(blocksdiv);
		
		/* append block dependencies */
		var waiting = _private.blockMethod.blockScripts();
		
		/* a list of dependency objects in 'waiting', we wait until all are loaded before moving on */
		for(let w = 0; w < waiting.length; w++) {
			var ctry = 0;
			var tries = 100;
			while(typeof window[waiting[w]] == "undefined") {
				if(ctry > tries) {
					console.log('Reached wait limit for script: ' + waiting[w]); break;
				}
				await _private.helper.sleep(100); // we can't continue until dependencies are loaded
				ctry++;
			}
		}
		
		/* store pageData for processing further steps */
		_private.quizData.data = pageData;
		
		/* function for creating quiz iframe */
		function newIframe() {
			/* create and set up iframe to store quiz */
			var iframe = document.createElement('iframe');
			iframe.setAttribute("class", "col col-100 bengine-iframe");
			iframe.setAttribute("style", "visibility:hidden;display:none");
			iframe.setAttribute("frameBorder","0");
			
			this.iframe = iframe;
			
			this.setUp = function(blocksdiv,submitFunc) {
				blocksdiv.innerHTML = '';
				blocksdiv.appendChild(this.iframe);
				
				var bstyle = document.createElement('style');
				bstyle.innerHTML = document.getElementById('bengine-global-styles').innerHTML;
				this.iframe.contentDocument.head.appendChild(bstyle);
				
				var qform = document.createElement('form');
				qform.addEventListener("submit",submitFunc);
				this.iframe.contentDocument.body.appendChild(qform);
			};
		};
		
		function quizSubmitFunc(event) {
			event.preventDefault();
			
			for(var i = 0; i < event.srcElement.elements.length; i++) {
				var key = event.srcElement.elements[i].name;
				var value = event.srcElement.elements[i].value;
				
				var keys = key.split(".");
				
				if(_private.quizData.submitData[keys[0]]) {
					_private.quizData.submitData[keys[0]][keys[1]] = value;
				} else {
					_private.quizData.submitData[keys[0]] = {};
					_private.quizData.submitData[keys[0]][keys[1]] = value;
				}
			}
			
			var submit = false;
			if(_private.quizData.stepConditional) {
				var keys = _private.quizData.stepConditional.split(".");
				if(_private.quizData.submitData[keys[0]]) {
					if(_private.quizData.submitData[keys[0]][keys[1]]) {
						submit = true;
					}
				}
			} else {
				submit = true;
			}
			
			if(submit) {				
				/* grab store variables & submit variabes, then store them */
				var nVars = {};
				_private.quizData.store.forEach(function(element) {
					var parts = element.split(".");
					if(!nVars[parts[0]]) nVars[parts[0]] = {};
					nVars[parts[0]][parts[1]] = _protected.variables[parts[0]][parts[1]];
				});
				
				_protected.variables = Object.assign(nVars,_private.quizData.submitData);
				
				/* reset stuff here */
				_private.quizData.submitData = {};
				_private.quizData.stepConditional = "";
				_private.quizData.stepCurrent = _private.quizData.stepNext;
				_private.quizData.stepNext = null;
				_private.quizData.submitData = {};
				_private.quizData.store = [];
				
				var iframeObj = new newIframe();
				iframeObj.setUp(blocksdiv,quizSubmitFunc);
				var iframe = iframeObj.iframe;
				
				processQuizBlock(iframe,_private.quizData.data,_private.quizData.stepCurrent,{done:false})
			}
			
			return false;
		};
		
		var iframeObj = new newIframe();
		iframeObj.setUp(blocksdiv,quizSubmitFunc);
		var iframe = iframeObj.iframe;
		
		/*
			iframe: the iframe to attach block data to
			pageData: array of Bengine page data
			count: keeps count of position of block to process in pageData
			task: an object with 'done' key, used to view whether runData() is complete
		*/
		async function processQuizBlock(iframe,pageData,count,task) {
			if(count === -1 || count >= pageData.length) {
				iframe.setAttribute("style", "visibility:visible;display:block");
				return;	
			}
			
			/* create the block */
			var blockType = pageData[count];
			var blockData = pageData[count + 1];
			
			var result = _private.extensibles[blockType].runData(blockData,iframe,task);
			
			var tries = 0;
			var maxtries= 100;
			while(!task.done && tries < maxtries) {
				await _private.helper.sleep(50);
				tries++;
			}

			if(tries === maxtries) {
				_private.alerts.log(blockType + ' never completed.');
			}
			
			var stepFound = false;
			switch(blockType) {
				case "qstep":
					var cstep = _private.quizData.stepCurrent[0];
					if(typeof result === "string") {
						_private.quizData.stepConditional = result;
					}
					
					stepFound = true;
					break;
				case "qstore":
					if(typeof result === "object" && result.constructor.name === "Array") {
						_private.quizData.store = _private.quizData.store.concat(result);
					}
					break;
				case "qans":
					if(typeof result === "number") {
						_private.quizData.grade = result;
					}
					break;
				default:
					
			}
			count += 2;
			
			if(count + 2 < pageData.length - 1) {
				_private.quizData.stepNext = count;
			} else {
				_private.quizData.stepNext = -1; // indicates no further steps
			}
					
			if(stepFound) {
				count = -1;
			}
			
			task.done = false;
			
			processQuizBlock(iframe,pageData,count,task);
		};
		
		processQuizBlock(iframe,pageData,0,{done:false});
	};
	
	/*
		engineID (string) - element id in DOM, Bengine blocks are displayed here
		pagePath (string) - directory location for file saves and assets, empty string -> front-end only mode
	*/
	_public.loadQuizShow = function(engineID,pagePath,pageData = []) {
		/* validate data */
		try {
			if(typeof engineID !== 'string') throw Error('Invalid engineID passed to loadQuizShow()');
			if(typeof pagePath !== 'string') throw Error('Invalid pagePath passed to loadQuizShow()');
			if(!Array.isArray(pageData)) throw Error('pageData must be array passed to loadQuizShow()');
		} catch(err) {
			_private.alerts.alert(err.message);
			return -1;
		}
		
		pagePath = pagePath.replace(/^\/(.+)?\/$/g,"$1");
		
		/* initialize parameters */
		_private.engineID = engineID;
		_private.pagePath = pagePath;
		
		if(pageData.length < 1 && pagePath.length > 0) {
			var fpromise = _private.helper.retrieveResource(_private.contentPath + pagePath + "/bengine.json");
			fpromise.then(function(result) {
				dataObj = JSON.parse(result.data.file);
				rpageData = [];
				for(let i = 0; i < dataObj.types.length; i++) {
					rpageData.push(dataObj.types[i]);
					rpageData.push(dataObj.content[i]);
				}
				if(document.readyState !== "loading") {
					_private.loadQuizShowReady(rpageData);
				} else {
					window.addEventListener('DOMContentLoaded', function() {
						_private.loadQuizShowReady(rpageData);
					});
				}
			},function(error) {
				_private.alerts.alert("Error: " + error.msg + " Status: " + error.status);
			});
		} else {
			if(document.readyState !== "loading") {
				_private.loadQuizShowReady(pageData);
			} else {
				window.addEventListener('DOMContentLoaded', function() {
					_private.loadQuizShowReady(pageData);
				});
			}
		}
	};
	this.loadQuizShow = _public.loadQuizShow;
	
	/*
		pageData (array)[string,object,...] -  optional, for loading data directly. block type & block content, repeated for every block
	*/
	_private.loadBlocksEditReady = async function(pageData) {
		_private.status = 1;
		
		/* check that div to place Bengine in exists */
		var mainDiv = document.getElementById(_private.engineID);
	
		if(mainDiv === null) {
			return -1;
		} else {
			mainDiv.innerHTML = "";
			mainDiv.style.height = "100%";
		}
		
		/* initialize display */
		_private.display = new _private.displayClass(_private.engineID,_private.datahandler);
	
		/* engine div */
		var enginediv;
		enginediv = document.createElement('div');
		enginediv.setAttribute('class','bengine-instance');
		enginediv.setAttribute('id','bengine-instance-' + _private.engineID);
		mainDiv.appendChild(enginediv);
	
		/* blocks */
		var blocksdiv = document.createElement('div');
		blocksdiv.setAttribute('class','bengine-x-blocks');
		blocksdiv.setAttribute('id','bengine-x-blocks-' + _private.engineID);
		blocksdiv.innerHTML = "<p style='color:white'>loading blocks...</p>";
	
		/* append blocks div to engine div */
		enginediv.appendChild(blocksdiv);
		
		/* check that blocks are loaded, otherwise set to default 'not exists' type block */
		for(var i = 0; i < pageData.length; i += 2) {
			if(typeof _private.extensibles[pageData[i]] === "undefined") {
				_private.categoryCounts.unknown += 1;
				_private.extensibles[pageData[i]] = new _private.blockMethod.unknownBlock(pageData[i]);
			}
		}

		/* append block styles */
		_private.blockMethod.blockStyle();
		
		/* append block dependencies */
		var waiting = _private.blockMethod.blockScripts();
		
		for(let w = 0; w < waiting.length; w++) {
			var ctry = 0;
			var tries = 100;
			while(typeof window[waiting[w]] == "undefined") {
				if(ctry > tries) {
					console.log('Reached wait limit for script: ' + waiting[w]); break;
				}
				await _private.helper.sleep(100); // we can't continue until dependencies are loaded
				ctry++;
			}
		}
		
		blocksdiv.innerHTML = '';

		/* initial first block buttons, get count for style requirement below */
		var buttons = _private.blockMethod.blockButtons(0);
		var buttonCount = buttons.childNodes.length;
		blocksdiv.appendChild(buttons);
	
		var count = 0;
		var i = 1;
		var doubleBlockCount = pageData.length;
	
		/* hide the first delete button if no blocks, else show it */
		if(doubleBlockCount < 2) {
			buttons.childNodes[0].lastChild.children[0].style.visibility = 'hidden';
		} else {
			buttons.childNodes[0].lastChild.children[0].style.visibility = 'visible';
		}
		
		var cspot = 0;
		Object.keys(_private.categoryCounts).forEach(function(element) {
			if(_private.categoryCounts[element] !== 0) {
				cspot += 1;
			}
		});
	
		while(count < doubleBlockCount) {
			/* create the block */
			var block = _private.blockMethod.generateBlock(i,pageData[count]);
			var retblock = _private.extensibles[pageData[count]].insertContent(block,pageData[count + 1]);
			retblock = _private.blockMethod.addRunBtn(i,_private.extensibles[pageData[count]],retblock);
	
			/* create the block buttons */
			buttons = _private.blockMethod.blockButtons(i);
	
			/* hide the last delete button */
			if(count === doubleBlockCount - 2) {
				/* last button is delete, so hide last delete button */
				buttons.childNodes[0].children[cspot].children[0].style.visibility = 'hidden';
			} else {
				buttons.childNodes[0].children[cspot].children[0].style.visibility = 'visible';
			}
	
			/* create block + button div */
			var group = document.createElement('div');
			group.setAttribute('class','bengine-block bengine-block-' + _private.engineID);
			group.setAttribute('id','bengine-' + _private.engineID + '-' + i);
	
			group.appendChild(retblock);
			group.appendChild(buttons);
	
			/* append group to blocks div */
			blocksdiv.appendChild(group);
	
			/* do any rendering the block needs */
			_private.extensibles[pageData[count]].afterDOMinsert('bengine-a-' + _private.engineID + '-' + i,null);
	
			count += 2;
			i++;
		}
	
		/*** HIDDEN FILE FORM ***/
	
		/* hidden form for media uploads */
		var fileinput = document.createElement('input');
		fileinput.setAttribute('type','file');
		fileinput.setAttribute('id','bengine-file-select-' + _private.engineID);
	
		var filebtn = document.createElement('button');
		filebtn.setAttribute('type','submit');
		filebtn.setAttribute('id','upload-button');
	
		var url = _private.helper.createURL("/upload");
	
		var fileform = document.createElement('form');
		fileform.setAttribute('id','file-form-' + _private.engineID);
		fileform.setAttribute('action',url);
		fileform.setAttribute('method','POST');
		fileform.style.visibility = 'hidden';
	
		fileform.appendChild(fileinput);
		fileform.appendChild(filebtn);
	
		/* append the hidden file form to the blocksdiv */
		enginediv.appendChild(fileform);
	};
	
	/*
		engineID (string) - element id in DOM, Bengine blocks are displayed here
		pagePath (string) - directory location for file saves and assets, empty string -> front-end only mode
	*/
	_public.loadBlocksEdit = function(engineID,pagePath,pageData = []) {
		/* validate data */
		try {
			if(typeof engineID !== 'string') throw Error('Invalid engineID passed to blockEngineStart()');
			if(typeof pagePath !== 'string') throw Error('Invalid pagePath passed to blockEngineStart()');
			if(!Array.isArray(pageData)) throw Error('pageData must be array passed to blockEngineStart()');
		} catch(err) {
			_private.alerts.alert(err.message);
			return -1;
		}
		
		pagePath = pagePath.replace(/^\/(.+)?\/$/g,"$1");
		
		/* initialize parameters */
		_private.engineID = engineID;
		_private.pagePath = pagePath;
		
		if(pageData.length < 1 && pagePath.length > 0) {
			var fpromise = _private.helper.retrieveResource(_private.contentPath + pagePath + "/bengine.json");
			fpromise.then(function(result) {
				dataObj = JSON.parse(result.data.file);
				rpageData = [];
				for(let i = 0; i < dataObj.types.length; i++) {
					rpageData.push(dataObj.types[i]);
					rpageData.push(dataObj.content[i]);
				}
				if(document.readyState !== "loading") {
					_private.loadBlocksEditReady(rpageData);
				} else {
					window.addEventListener('DOMContentLoaded', function() {
						_private.loadBlocksEditReady(rpageData);
					});
				}
			},function(error) {
				if(error.status === 404) {
					// new file
					_private.loadBlocksEditReady([]);
				} else {
					_private.alerts.alert("Error: " + error.msg + " Status: " + error.status);
				}
			});
		} else {
			if(document.readyState !== "loading") {
				_private.loadBlocksEditReady(pageData);
			} else {
				window.addEventListener('DOMContentLoaded', function() {
					_private.loadBlocksEditReady(pageData);
				});
			}
		}
	};
	this.loadBlocksEdit = _public.loadBlocksEdit;
	
	/*** Section: Private Methods For Handling Blocks ***/
	
	// fetch block javascript
	_private.blockMethod.blockScripts = function() {
		/* 
			function that fetches scripts, synchronously
			
			existing - array of src already retrieved
			scriptArray - array of objects containing script data
			position - position in scriptArray to retrieve
			wait - name of object that must exist before fetching next script
			tries - number of times to wait for wait object before giving up
		*/
		function fetchScript(existing,scriptArray,position,wait,tries) {
			if(wait && typeof window[wait] == 'undefined' && tries < 100) {
				tries++;
				setTimeout(function() { fetchScript(existing,scriptArray,position,wait,tries) },100);
			} else {
				var element = scriptArray[position];
				if(element.source === '' || existing.indexOf(element.source) < 0) {
					existing.push(element.source);
	
					/* attach the blocks dependencies */
					var scripts = document.createElement('script');
					scripts.async = false;
					
					if(_protected.options.localMode && scripts.type === "text/javascript") {
						scripts.src = Bengine.benginePath + '/libs/' + element.source.split('/').slice(-1);
					} else {
						scripts.src = element.source;
					}
					
					scripts.type = element.type;
					if(element.integrity) {
						scripts.integrity = element.integrity;
					}
					scripts.innerHTML = element.inner;
					document.getElementsByTagName('head')[0].appendChild(scripts);
		
					/* fetch next script */
					if(scriptArray.length > (position + 1)) {
						fetchScript(existing,scriptArray,position+1,'',0); // element.wait 
					}
				}
			}
		}
		
		var waiting = [];
		
		/* get script data for each extensibles */
		for(var prop in _private.extensibles)(function(prop) {
			if(_private.extensibles.hasOwnProperty(prop)) {
				// ensure we haven't loaded this dependency yet
				if (!_private.extState.dependencies.hasOwnProperty(prop)) {
					_private.extState.dependencies[prop] = true;
					var scriptArray = _private.extensibles[prop].fetchDependencies();
					if(scriptArray !== null) {					
						fetchScript([],scriptArray,0,'',0);
						scriptArray.forEach(function(element) {
							if(element.wait) {
								waiting.push(element.wait);
							}
						});
					}
				}
			}
		})(prop);
		
		return waiting;
	};
	
	// add block styles
	_private.blockMethod.blockStyle = function() {
		for(var prop in _private.extensibles)(function(prop) {
			if(_private.extensibles.hasOwnProperty(prop)) {
				// ensure we haven't loaded this dependency yet
				if (!_private.extState.styles.hasOwnProperty(prop)) {
					_private.extState.styles[prop] = true;
					var style = document.createElement('style');
					style.type = 'text/css';
					style.innerHTML = _private.extensibles[prop].styleBlock();
					document.getElementsByTagName('head')[0].appendChild(style);
				}
			}
		})(prop);
	};
	
	// count the existing blocks 
	_private.blockMethod.countBlocks = function() {
	
		/* block IDs are just numbers, so count the number of IDs */
		var num = 0;
		var miss = true;
		while (miss === true) {
			num++;
	
			/* undefined is double banged to false, and node is double banged to true */
			miss = Boolean(document.getElementById('bengine-' + _private.engineID + '-' + num));
		}
	
		/* decrement num, since the check for id happens after increment */
		return --num;
	};
	
	// create a blank block
	_private.blockMethod.generateBlock = function(bid,btype) {
		var block = document.createElement('div');
		if(!_protected.options.enableSingleView && btype !== 'title') {
			block.setAttribute('style','margin-bottom:26px;');
		}
		block.setAttribute('data-btype',btype);
		block.setAttribute('id','bengine-a-' + _private.engineID + '-' + bid);
	
		return block;
	};
	
	// create block buttons
	_private.blockMethod.blockButtons = function(bid) {
	
		/* this div will hold the buttons inside of it */
		var buttonDiv = document.createElement('div');
		buttonDiv.setAttribute('class','row');
		buttonDiv.setAttribute('id','bengine-b-' + _private.engineID + '-' + bid);
	
		var catDiv = document.createElement("div");
		catDiv.setAttribute("id","bengine-cat-" + _private.engineID + '-' + bid);
		catDiv.setAttribute("class","bengine-blockbtns row");
		buttonDiv.appendChild(catDiv);
	
		/* determine width of each category button */
		let sum = 1; // delete button
		var categoryArray = [];
		if(_private.categoryCounts.media > 0) {
			sum++;
			categoryArray.push("media");
		}
		if(_private.categoryCounts.text > 0) {
			sum++;
			categoryArray.push("text");
		}
		if(_private.categoryCounts.quiz > 0) {
			sum++;
			categoryArray.push("quiz");
		}
		if(_private.categoryCounts.unknown > 0) {
			sum++;
			categoryArray.push("unknown");
		}

		let width;
		switch(sum) {
			case 2:
				width = '50'; break;
			case 3:
				width = '1_3'; break;
			case 4:
				width = '25'; break;
			case 5:
				width = '20'; break;
			default:
				width = '100';
		}
		
		categoryArray.forEach(function(element) {
			var colDiv = document.createElement('div');
			colDiv.setAttribute('class','col col-' + width);
			
			/* create category button */
			var btn = document.createElement('button');
			btn.onclick = function() {
				catDiv.setAttribute("style","display:none;visibility:hidden");
				var row = document.getElementById("bengine-" + _private.engineID + '-' + element + '-' + bid);
				row.setAttribute("style","display:block;visibility:visible;");
			};
			btn.setAttribute("class","bengine-blockbtn bengine-addbtn");
			btn.innerHTML = element;
			
			/* create div for block buttons in category */
			var subRow = document.createElement("div");
			subRow.setAttribute("id","bengine-" + _private.engineID + '-' + element + '-' + bid);
			subRow.setAttribute("class","bengine-blockbtns row");
			subRow.setAttribute("style","display:none;visibility:hidden;");
			buttonDiv.appendChild(subRow);
			
			/* create back button to categories */
			var colBackDiv = document.createElement('div');
			colBackDiv.setAttribute('class','col col-100'); // columns: '1_' + (_private.categoryCounts[element] + 1)
			
			var btnBack = document.createElement('button');
			btnBack.onclick = function() {
				catDiv.setAttribute("style","display:block;visibility:visible");
				var row = document.getElementById("bengine-" + _private.engineID + '-' + element + '-' + bid);
				row.setAttribute("style","display:none;visibility:hidden;");
			};
			btnBack.setAttribute("class","bengine-blockbtn bengine-addbtn");
			btnBack.innerHTML = "&larr;";
			
			var backRow = document.createElement('div');
			backRow.setAttribute('class','row');
			
			colBackDiv.appendChild(btnBack);
			backRow.appendChild(colBackDiv);
			subRow.appendChild(backRow);
	
			/* append everything */
			colDiv.appendChild(btn);
			catDiv.appendChild(colDiv);
		});
		
		var delDiv = document.createElement('div');
		delDiv.setAttribute('class','col col-' + width);
	
		var delBtn = document.createElement('button');
		delBtn.setAttribute('id','bengine-d-' + _private.engineID + '-' + bid);
		delBtn.setAttribute("class","bengine-blockbtn bengine-delbtn");
		delBtn.onclick = function() {
			_private.blockMethod.deleteBlock(bid);
		};
		delBtn.style.visibility = 'hidden';
		delBtn.innerHTML = "&darr;";
	
		delDiv.appendChild(delBtn);
		catDiv.appendChild(delDiv);
		
		/* add block buttons to each category */
		for(var prop in _private.extensibles)(function(prop) {
			if(_private.extensibles.hasOwnProperty(prop)) {
				var btn = document.createElement('button');
				btn.onclick = function() {
					_private.blockMethod.addBlock(bid,_private.extensibles[prop].type);
					catDiv.setAttribute("style","display:block;visibility:visible");
					var row = document.getElementById("bengine-" + _private.engineID + '-' + _private.extensibles[prop].category + '-' + bid);
					row.setAttribute("style","display:none;visibility:hidden;");
				};
				btn.setAttribute("class","bengine-blockbtn bengine-addbtn");
				btn.innerHTML = _private.extensibles[prop].name;
	
				var subRow = buttonDiv.childNodes[categoryArray.indexOf(_private.extensibles[prop].category) + 1];
				
				var btnRow = document.createElement('div');
				btnRow.setAttribute('class','row');
				
				var colDiv = document.createElement('div');
				colDiv.setAttribute('class','col col-100');
	
				colDiv.appendChild(btn);
				btnRow.appendChild(colDiv);
				subRow.appendChild(btnRow);
			}
		})(prop);
	
		return buttonDiv;
	};
	
	_private.blockMethod.addRunBtn = function(bid,ext,block) {
		/* block that use file upload do not require a run button */
		if(ext.upload) {
			return block;	
		}
		
		/* if set to null, this block doesn't have/need a run btn */
		if(ext.runBlock === null) {
			return block;
		}
		
		var runBtn = document.createElement('button');
		if(ext.category === "code") {
			runBtn.innerHTML = 'Run Code';
		} else {
			runBtn.innerHTML = 'Run Block';
		}
		
		runBtn.onclick = function() {
			ext.runBlock(runBtn.parentNode.id);
		};
		block.appendChild(runBtn);
		
		return block;
	};
	
	_private.blockMethod.makeSpace = function(bid,count) {
		var track = count;
		while(bid < track) {
			/* change blocks to this value */
			var next = track + 1;
	
			/* replace the button IDs */
			var buttons = _private.blockMethod.blockButtons(next);
			document.getElementById('bengine-b-' + _private.engineID + '-' + track).parentNode.replaceChild(buttons,document.getElementById('bengine-b-' + _private.engineID + '-' + track));
	
			/* replace the content block id */
			document.getElementById('bengine-a-' + _private.engineID + '-' + track).setAttribute('id','bengine-a-' + _private.engineID + '-' + next);
	
			/* replace the block id */
			document.getElementById('bengine-' + _private.engineID + '-' + track).setAttribute('id','bengine-' + _private.engineID + '-' + next);
	
			/* update the count */
			track--;
		}
	};
	
	_private.blockMethod.insertBlock = function(block,buttons,bid,count) {
	
		/* grab the blocks container */
		var blocksdiv = document.getElementById('bengine-x-blocks-' + _private.engineID);
	
		/* create the block div */
		var group = document.createElement('div');
		group.setAttribute('class','bengine-block bengine-block-' + _private.engineID);
		group.setAttribute('id','bengine-' + _private.engineID + '-' + bid);
	
		/* append the content block & buttons div to the block div */
		group.appendChild(block);
		group.appendChild(buttons);
	
		/* find the location to insert the block and insert it */
		if(bid <= count) {
			var position = blocksdiv.children[bid];
			blocksdiv.insertBefore(group,position);
		} else {
			/* you do this if the block goes at the end, it's the last block */
			blocksdiv.appendChild(group);
		}
	};
	
	_private.blockMethod.createBlock = function(cbid,blockObj) {
	
		var blockCount = _private.blockMethod.countBlocks();
	
		/* make space if inserting block, if appending block, ignore */
		if(cbid < blockCount) {
			_private.blockMethod.makeSpace(cbid,blockCount);
		}
	
		/* create and insert block */
		var bid = cbid + 1;
	
		var block = _private.blockMethod.generateBlock(bid,blockObj.type);
		var retblock = blockObj.insertContent(block,{});
		retblock = _private.blockMethod.addRunBtn(bid,blockObj,retblock);
			
		var blockbuttons = _private.blockMethod.blockButtons(bid);
		_private.blockMethod.insertBlock(retblock,blockbuttons,bid,blockCount);
		blockObj.afterDOMinsert('bengine-a-' + _private.engineID + '-' + bid,null);
	
		/* make delete buttons visible */
		var i = 0;
		while(i <= blockCount) {
			document.getElementById('bengine-d-' + _private.engineID + '-' + i).style.visibility = 'visible';
			i++;
		}
	};
	
	_private.blockMethod.addBlock = function(bid,blockTypeName) {
		if(_protected.options.blockLimit < (document.getElementsByClassName("bengine-block-" + _private.engineID).length + 1)) {
			_private.alerts.alert("You Have Reached The Block Limit");
			return;
		}
	
		var blockObj = _private.extensibles[blockTypeName];
	
		/* media blocks only allowed in-house, all other block (text-based) route to regular process */
		if (blockObj.upload) {
			/* these blocks call uploadMedia() which uploads media and then calls createBlock() */
			_private.datahandler.uploadMedia(bid + 1,blockObj);
		} else {
			/* these blocks call createBlock() to add the block */
			_private.blockMethod.createBlock(bid,blockObj);
			
			/* save blocks to temp table, indicated by false */
			_private.display.updateSaveStatus("Not Saved");
			if(_protected.options.enableAutoSave) {
				saveBlocks(false);
			}
		}
	};
	
	_private.blockMethod.closeSpace = function(cbid,count) {
		var bid = cbid;
		while(bid < count) {
			/* change blocks to this value */
			var next = bid + 1;
	
			/* replace the button IDs */
			var buttons = _private.blockMethod.blockButtons(bid);
			document.getElementById('bengine-b-' + _private.engineID + '-' + next).parentNode.replaceChild(buttons,document.getElementById('bengine-b-' + _private.engineID + '-' + next));
	
			/* replace the content block id */
			document.getElementById('bengine-a-' + _private.engineID + '-' + next).setAttribute('id','bengine-a-' + _private.engineID + '-' + bid);
	
			/* replace the block id */
			document.getElementById('bengine-' + _private.engineID + '-' + next).setAttribute('id','bengine-' + _private.engineID + '-' + bid);
	
			/* update the bid */
			bid++;
		}
	};
	
	_private.blockMethod.removeBlock = function(bid) {
		let element = document.getElementById('bengine-' + _private.engineID + '-' + bid);
		let block = element.childNodes[0];
		let blockType = block.getAttribute('data-btype');
		
		/* run block's destructor */
		_private.extensibles[blockType].destroy(block);
		
		element.parentNode.removeChild(element);
	};
	
	_private.blockMethod.deleteBlock = function(cbid) {
		var blockCount = _private.blockMethod.countBlocks();
	
		var bid = cbid + 1;
	
		/* delete the block */
		_private.blockMethod.removeBlock(bid);
	
		/* close space if removing block from middle, otherwise ignore */
		if(bid < blockCount) {
			_private.blockMethod.closeSpace(bid,blockCount);
		}
	
		/* make delete buttons visible & last button invisible */
		var i = 0;
		blockCount = _private.blockMethod.countBlocks();
		while(i < blockCount) {
			document.getElementById('bengine-d-' + _private.engineID + '-' + i).style.visibility = 'visible';
			i++;
		}
		document.getElementById('bengine-d-' + _private.engineID + '-' + i).style.visibility = 'hidden';
	
		/* save blocks to temp table, indicated by false */
		_private.display.updateSaveStatus("Not Saved");
		if(_protected.options.enableAutoSave) {
			saveBlocks(false);
		}
	};
	
	/*** Section: Ajax Functions For Handling Data On The Back-End ***/
	
	_private.datahandler.uploadEngineFile = function() {
		_private.datahandler.requestFile(".zip,.txt,.njn",function(file) {
			if (file.type === "application/zip") {
				var zip = new Bengine.libs.zip();
				zip.loadAsync(file).then(function(unzip) {
					var txtFile;
				    var keys = Object.keys(unzip.files);
				    var filePromises = [];
				    for (key of keys) {
					    if (!unzip.files[key].dir) {
						    var filename = key.split('/').pop();
						    /* don't process hidden files, mainly deals with annoying OS directory custom attributes files */
						    if (filename[0] !== '.') {
							    var extension = key.slice(key.length-4,key.length);
							    if (extension !== ".njn") {
									  filePromises.push(_private.datahandler.sendFile(new File([unzip.files[key]._data.compressedContent], unzip.files[key].name)));
							    } else {
								    txtFile = (new TextDecoder("utf-8")).decode(unzip.files[key]._data.compressedContent);
							    }
						    }
						  }
				    }

				    if (txtFile) {
					    Promise.all(filePromises).then(function(values) {
						    for (value of values) {
							    if (value[0] !== 200) {
								    _private.alerts.alert("There was an error uploading: " + value[1]);
							    }
						    }
						    var blocks = _private.helper.parseEngineFile(txtFile);
							var pageData = _private.helper.convertNjnFormatToPageDataArray(blocks);
							_private.loadBlocksEditReady(pageData);
					    });
				    }
				});
			} else if (file.type === "text/plain" || (file.name.indexOf('.njn') > 1 && file.name.split('.')[file.name.split('.').length-1] === "njn") ) {
				var reader = new FileReader();
				reader.onload = function(e) {
				    var blocks = _private.helper.parseEngineFile(reader.result);
				    var pageData = _private.helper.convertNjnFormatToPageDataArray(blocks);
				    _private.loadBlocksEditReady(pageData);
				}
				reader.readAsText(file);
			}
		});
	};
	
	if(_protected.options.mode === 'bengine') {
		// used for creating a Bengine File of the blocks
		_private.datahandler.createFile = function() {
			var blockCount = _private.blockMethod.countBlocks();
			var bid = 1;
		
			/* get the block types & contents */
			var BengineArray = [];
			var BengineAssets = [];
			if(blockCount > 0) {
				var i = 0;
				var ns = 1;
				while(blockCount >= bid) {
					/* get the block type */
					let btype = document.getElementById('bengine-a-' + _private.engineID + '-' + bid).getAttribute('data-btype');
					
					/* check for quiz block */
					if(_private.extensibles[btype].category === "quiz") {
						BengineArray.push("# " + btype + " block cannot be used with Bengine\n\n");
						i++; bid++; continue;
					}
		
					/* get the block content */
					let bstuff = _private.extensibles[btype].saveContent('bengine-a-' + _private.engineID + '-' + bid);
					let bcontent = bstuff['content'].replace(/\{\%/g,'\\{%').replace(/\%\}/g,'\\%}');
					
					/* check for namespace, if none, create random one */
					var namespace = 'ns' + ns++;
					
					/* if there's an asset, grab it */
					if (_private.extensibles[btype].saveFile) {
    					BengineAssets.push(_private.extensibles[btype].saveFile('bengine-a-' + _private.engineID + '-' + bid));
					}
					
					if(btype !== 'qstep') {
						BengineArray.push(`{%${btype}:${namespace}\n${bcontent}\n%}\n\n`);
					} else {
						BengineArray.push(`@@@@${bcontent}\n\n`);
					}
		
					i++;
					bid++;
				}
			}
			
			var BengineFile = BengineArray.join('');
			
			// create .zip file or just .njn
			if (BengineAssets.length > 0) {
				var zip = new Bengine.libs.zip();
				zip.file(_private.pagePath.replace(/\//g,'') + ".njn", BengineFile);
				for (asset of BengineAssets) {
					zip.file(asset.name, asset);
				}
				zip.generateAsync({type:"blob"}).then(function (blob) {
				    Bengine.libs.file.saveAs(blob,_private.pagePath.replace(/\//g,'') + '.zip');
				});
			} else {
				var qd = window.open();
				qd.document.open();
				qd.document.write('<html><head><title>Bengine File</title></head><body>');
				qd.document.write('<pre>' + BengineFile + '</pre>');
				qd.document.write('</body></html>');
				qd.document.close();
			}
		};
		
	} else if(_protected.options.mode === 'qengine') {
		// used for creating a Qengine File of the blocks
		_private.datahandler.createFile = function() {
			var blockCount = _private.blockMethod.countBlocks();
			var bid = 1;
		
			/* get the block types & contents */
			var QengineArray = [];
			var QengineAssets = [];
			if(blockCount > 0) {
				var i = 0;
				var ns = 1;
				while(blockCount >= bid) {
					/* get the block type */
					let btype = document.getElementById('bengine-a-' + _private.engineID + '-' + bid).getAttribute('data-btype');
					
					/* check for quiz block */
					if(_private.extensibles[btype].category !== "quiz") {
						QengineArray.push("# " + btype + " block cannot be used with Qengine\n\n");
						i++; bid++; continue;
					}
		
					/* get the block content */
					let bstuff = _private.extensibles[btype].saveContent('bengine-a-' + _private.engineID + '-' + bid);
					let bcontent = bstuff['content'].replace(/\{\%/g,'\\{%').replace(/\%\}/g,'\\%}');
					
					/* check for namespace, if none, create random one */
					var namespace;
					if(Object.keys(bstuff).includes('namespace')) {
						if(bstuff['namespace'].length > 0) {
							namespace = bstuff['namespace'].trim();
						} else {
							namespace = 'ns' + ns++;
						}
					} else {
						namespace = 'ns' + ns++;
					}
					
					/* check for conditional, if none, omit */
					var conditional;
					if(Object.keys(bstuff).includes('conditional')) {
						conditional = bstuff['conditional'].trim();
					} else {
						conditional = '';
					}
					
					/* if there's an asset, grab it */
					if (_private.extensibles[btype].saveFile) {
    					QengineAssets = QengineAssets.concat(_private.extensibles[btype].saveFile('bengine-a-' + _private.engineID + '-' + bid));
					}
					
					if(btype !== 'qstep') {
						QengineArray.push(`{%${btype}:${namespace}:${conditional}\n${bcontent}\n%}\n\n`);
					} else {
						QengineArray.push(`@@@@${bcontent}\n\n`);
					}
		
					i++;
					bid++;
				}
			}
			
			var QengineFile = QengineArray.join('');
			
			// create .zip file or just .njn
			if (QengineAssets.length > 0) {
				var zip = new Bengine.libs.zip();
				zip.file(_private.pagePath.replace(/\//g,'') + ".njn", QengineFile);
				var folder = zip.folder('assets');
				for (asset of QengineAssets) {
					try {
						folder.file(asset.name, asset);
					} catch(err) {
						console.log(err);
					}
				}
				zip.generateAsync({type:"blob"}).then(function (blob) {
				    Bengine.libs.file.saveAs(blob,_private.pagePath.replace(/\//g,'') + '.zip');
				});
			} else {
				var qd = window.open();
				qd.document.open();
				qd.document.write('<html><head><title>Qengine File</title></head><body>');
				qd.document.write('<pre>' + QengineFile + '</pre>');
				qd.document.write('</body></html>');
				qd.document.close();
			}
		};
		
	} else {
		// should never reach here
		_private.datahandler.createFile = function() {}; 
		_private.datahandler.uploadEngineFile = function() {};
	}
	
	_private.datahandler.revertBlocks = function() {
		/* create the url destination for the ajax request */
		var url = _private.helper.createURL("/revertblocks");
	
		/* get the pid & page name */
		var xid = document.getElementById('bengine-x-id-' + _private.engineID).getAttribute('data-xid');
		var xidName = document.getElementById('bengine-x-id-' + _private.engineID).getAttribute('name');
	
		var xmlhttp;
		xmlhttp = new XMLHttpRequest();
	
		var params = "xid=" + xid + "&pagetype=" + xidName;
	
		xmlhttp.open("POST",url,true);
	
		xmlhttp.setRequestHeader("Content-type","application/x-www-form-urlencoded");
	
		xmlhttp.onreadystatechange = function() {
			if (xmlhttp.readyState === XMLHttpRequest.DONE) {
				switch(xmlhttp.status) {
					case 500:
						_private.alerts.alert("Unknown Error. Status: 500"); break;
					case 0:
						_private.alerts.alert("Unknown Error. Status: 0"); break;
					case 200:
						var result = JSON.parse(xmlhttp.responseText);
						var oldBengine = document.getElementById('bengine-instance-' + _private.engineID);
						var main = oldBengine.parentNode;
						main.removeChild(oldBengine);
						if(result.data === "") {
							blockEngineStart(main.getAttribute('id'),[xidName,xid],[]);
						} else {
							blockEngineStart(main.getAttribute('id'),[xidName,xid],result.data.split(","));
						}
						_private.display.updateSaveStatus("Saved");
						break;
					default:
						var result = JSON.parse(xmlhttp.responseText);
						_private.alerts.alert("Error. Status: " + xmlhttp.status + " Message: " + result.msg);
				}
			}
		};
	
		xmlhttp.send(params);
	};
	
	_private.datahandler.saveBlocks = function(which) {	
		if(_private.pagePath.length < 1) {
			console.log('Page path is empty, uploads are disabled.');
			return;
		}
			
		/* set parameter to be sent to back-end that determines which table to save to, temp or perm, & set save status display */
		var table;
		if(which === false) {
			table = 0;
		} else {
			table = 1;
		}
	
		_private.status = table;
	
		/* variables for storing block data */
		var blockType = [];
		var blockContent = [];
	
		var blockCount = _private.blockMethod.countBlocks();
		var bid = 1;
	
		/* get the block types & contents */
		var contentToSave = {};
		if(blockCount > 0) {
			var i = 0;
			while(blockCount >= bid) {
				/* get the block type */
				var btype = document.getElementById('bengine-a-' + _private.engineID + '-' + bid).getAttribute('data-btype');
				blockType[i] = btype;
	
				/* get the block content */
				blockContent[i] = _private.extensibles[btype].saveContent('bengine-a-' + _private.engineID + '-' + bid);
	
				i++;
				bid++;
			}
		}
		
		/* merge mediaType & mediaContent arrays into default comma-separated strings */
		contentToSave['types'] = blockType;
		contentToSave['content'] = blockContent;
		
		/* create the url destination for the ajax request */
		var url = _private.helper.createURL("/save");
	
		var xmlhttp;
		xmlhttp = new XMLHttpRequest();
	
		/* if this is temp save, don't show saving progress */
		if(which !== false) {
			xmlhttp.upload.onprogress = function(e) {
				if (e.lengthComputable) {
					_private.display.progressUpdate(e.loaded);
				}
			};
			xmlhttp.upload.onloadstart = function(e) {
				_private.display.progressInitialize("Saving...",e.total);
			};
			xmlhttp.upload.onloadend = function(e) {
				_private.display.progressFinalize("Saved",e.total);
			};
		}
	
		contentToSave['eid'] = _private.engineID;
		contentToSave['fpath'] = _private.pagePath;
		contentToSave['tabid'] = table;
	
		xmlhttp.open("POST",url,true);
	
		xmlhttp.setRequestHeader("Content-type","application/json");
	
		xmlhttp.onreadystatechange = function() {
			if (xmlhttp.readyState === XMLHttpRequest.DONE) {
				switch(xmlhttp.status) {
					case 500:
						_private.alerts.alert("Unknown Error. Status: 500"); break;
					case 0:
						_private.alerts.alert("Unknown Error. Status: 0"); break;
					case 200:
						if(table === 1) {
							_private.display.updateSaveStatus("Saved");
						}
						break;
					default:
						var result = JSON.parse(xmlhttp.responseText);
						_private.alerts.alert("Error. Status: " + xmlhttp.status + " Message: " + result.msg);
				}
			}
		};
		
		xmlhttp.send(JSON.stringify(contentToSave));
	};
	
	// upload media files to server
	_private.datahandler.uploadProcess = function(bid,blockObj,file) {
		if(_private.pagePath.length < 1) {
			console.log('Page path is empty, uploads are disabled.');
			return;
		}

		/* wrap the ajax request in a promise */
		var promise = new Promise(function(resolve,reject) {

			/* create javascript FormData object and append the file */
			var formData = new FormData();
			formData.append('media',file,file.name);

			/* grab the domain and create the url destination for the ajax request */
			var url = _private.helper.createURL("/upload?fpath=" + encodeURIComponent(_private.pagePath) + "&btype=" + blockObj.type);

			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open('POST',url,true);

			/* upload progress */
			xmlhttp.upload.onloadstart = function(e) {
				_private.display.progressInitialize("Uploading...",e.total);
			};
			xmlhttp.upload.onprogress = function(e) {
				if (e.lengthComputable) {
					_private.display.progressUpdate(e.loaded);
				}
			};
			xmlhttp.upload.onloadend = function(e) {
				_private.display.progressFinalize("Uploaded",e.total);
			};

			/* conversion progress */
			xmlhttp.onprogress = function(e) {
				var spotArray = _private.helper.position(xmlhttp.responseText.length);
				var current = _private.helper.counter(false);
				var val = xmlhttp.responseText.slice(spotArray[0],spotArray[1]).split(",");
				if(current === 1) {
					_private.display.progressInitialize("Converting...",val[val.length - 1]);
				} else {
					_private.display.progressUpdate(val[val.length - 1]);
				}
			};

			xmlhttp.onloadend = function(e) {
				var spotArray = _private.helper.position(xmlhttp.responseText.length);
				var val = xmlhttp.responseText.slice(spotArray[0],spotArray[1]).split(",");
				_private.display.progressFinalize("Not Saved",val[val.length - 1]);
				_private.helper.counter(true);
				/* reset position */
				_private.helper.position(0);
			};
			
			xmlhttp.onreadystatechange = function() {
				if (xmlhttp.readyState === XMLHttpRequest.DONE) {
					switch(xmlhttp.status) {
						case 200:
						    if (xmlhttp.responseText.substr(0,6) !== "Error:") {
                                var spots = _private.helper.position(xmlhttp.responseText.length);
                                var val = xmlhttp.responseText.slice(spots[0],spots[1]).split(",");
							
                                resolve({msg:'Success',status:200,data:{spot:val[val.length - 1]}});
						    } else {
    						    _private.blockMethod.deleteBlock(bid - 1);
    						    reject({msg:xmlhttp.responseText,status:500,data:{}});
						    }
						    break;
						default:
							_private.blockMethod.deleteBlock(bid - 1);
							var result = JSON.parse(xmlhttp.responseText);
							reject({msg:result.msg,status:xmlhttp.status,data:{}});
					}
				}
			};

			xmlhttp.send(formData);
		});

		promise.then(function(result) {
			blockObj.afterDOMinsert('bengine-a-' + _private.engineID + '-' + bid,result.data.spot);

			/* save blocks to temp table, indicated by false */
			_private.display.updateSaveStatus("Not Saved");
			if(_protected.options.enableAutoSave) {
				saveBlocks(false);
			}
		},function(error) {
			_private.alerts.log(error.msg,"error");
		});
	};
	
	/*
		accept - string of media types to accept
		callback - function that receives file
	*/
	_private.datahandler.requestFile = function(accept,callback) {
		var fileSelect = document.getElementById('bengine-file-select-' + _private.engineID);

		if(accept !== 'undefined' && typeof accept === 'string') {
			fileSelect.setAttribute("accept", accept);
		} else {
			fileSelect.setAttribute("accept","");
		}
		
		fileSelect.click();
		
		fileSelect.onchange = function() {
			/* grab the selected file */
			var file = fileSelect.files[0];
	
			/* validation */
			if(fileSelect.files.length > 0) {
				if(file.size > (_protected.options.mediaLimit * 1048576)) {
					_private.alerts.alert(`Files Must Be Less Than ${_protected.options.mediaLimit} MB`);
					return;
				}
			} else {
				/* do nothing, no file selected */
				this.value = null;
				return;
			}
			
			if (typeof callback === "function") {
				callback(file);
			}
			
			/* resets selection to nothing, in case user decides to upload the same file, onchange will still fire */
			this.value = null;
		};
	};
	
	/* sends file to be uploaded without 'btype' which means no service is run */
	_private.datahandler.sendFile = function(file) {
		var promise = new Promise(function(resolve,reject) {
			var formData = new FormData();
			formData.append('media',file,file.name);
	
			var url = _private.helper.createURL("/upload?fpath=" + encodeURIComponent(_private.pagePath));
	
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open('POST',url,true);
			
			xmlhttp.onreadystatechange = function() {
				if (xmlhttp.readyState === XMLHttpRequest.DONE) {
					resolve([xmlhttp.status,file.name]);
				}
			};
			
			xmlhttp.send(formData);	
		});
		
		return promise;
	};
	
	_private.datahandler.uploadMedia = function(bid,blockObj) {
	
		/* get the hidden file-select object that will store the user's file selection */
		var fileSelect = document.getElementById('bengine-file-select-' + _private.engineID);
		
		if(blockObj.accept !== 'undefined' && typeof blockObj.accept === 'string') {
			fileSelect.setAttribute("accept", blockObj.accept);
		} else {
			fileSelect.setAttribute("accept","");
		}
	
		/* uploadMedia() is called when a block button is pressed, to show file select pop-up box, force click the file-select object */
		fileSelect.click();
	
		/* only upload media when a file select change has occurred, this prevents an empty block creation if the user presses 'cancel' */
		fileSelect.onchange = function() {
	
			/* grab the selected file */
			var file = fileSelect.files[0];
	
			/* validation */
			if(fileSelect.files.length > 0) {
				if(file.size > (_protected.options.mediaLimit * 1048576)) {
					_private.alerts.alert(`Files Must Be Less Than ${_protected.options.mediaLimit} MB`);
					return;
				}
			} else {
				/* do nothing, no file selected */
				this.value = null;
				return;
			}
	
			var checklengthvideo = false;
			var checklengthaudio = false;
			switch(blockObj.type) {
				case "audio":
					var audTempElement = document.createElement('audio');
					var audFileURL = URL.createObjectURL(file);
					audTempElement.src = audFileURL;
					checklengthaudio = true;
					break;
				case "video":
					var vidTempElement = document.createElement('video');
					var vidFileURL = URL.createObjectURL(file);
					vidTempElement.src = vidFileURL;
					checklengthvideo = true;
					break;
				default:
			}

			function uploadAll(bid,blockObj,file) {
				_private.blockMethod.createBlock(bid - 1,blockObj);
				
				//// TODO: local mode?
				// blockObj.afterDOMinsert('bengine-a-' + _private.engineID + '-' + bid,file);
				
				_private.datahandler.uploadProcess(bid,blockObj,file);
				_private.display.updateSaveStatus("Not Saved");
			}

			if(checklengthvideo) {
				vidTempElement.ondurationchange = function() {
					if(this.duration > _protected.options.playableMediaLimit) {
						_private.alerts.alert(`Video Files Must Be Less Than ${_protected.options.playableMediaLimit} Seconds`);
					} else {
						uploadAll(bid,blockObj,file);
					}
				};
			} else if(checklengthaudio) {
				audTempElement.ondurationchange = function() {
					if(this.duration > _protected.options.playableMediaLimit) {
						_private.alerts.alert(`Audio Files Must Be Less Than ${_protected.options.playableMediaLimit} Seconds`);
					} else {
						uploadAll(bid,blockObj,file);
					}
				};
			} else {
				uploadAll(bid,blockObj,file);
			}
			
			/* resets selection to nothing, in case user decides to upload the same file, onchange will still fire */
			this.value = null;
		};
	};
};

Bengine.libs = {
	zip: null,
	file: null,
	'#':[
		'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js',
		'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.min.js'
	]
};

Bengine.setScriptPath = function(path) {
	if(path) {
		Bengine.minifiedMode = pathArray.pop().indexOf('min') > -1 ? true : false;
		Bengine.benginePath = pathArray.slice(0,-1).join('/');
		return;
	}
	
	var scripts = document.getElementsByTagName('script');
	for(key in scripts) {
		if(scripts[key].src && scripts[key].src.indexOf('bengine') > -1) {
			var pathArray = scripts[key].src.split('/');
			if(pathArray.length < 2) {
				throw "Invalid Bengine script path. Bengine should be in js/bengine[.min].js";
			}
			Bengine.minifiedMode = pathArray.pop().indexOf('min') > -1 ? true : false;
			Bengine.benginePath = pathArray.slice(0,-1).join('/');
			break;
		}
	}
	if(!Bengine.benginePath) {
		throw "Unable to find Bengine path";
	}
};

Bengine.loadBlocks = function(blocks,updateId) {
	// validate
	if(typeof blocks === "undefined") {
		return -1;
	}
	
	if(typeof Bengine.benginePath === "undefined") {
		Bengine.setScriptPath();
	}
	
	function Status(updateId,blocks) {
		if (document.getElementById(updateId) === null) {
			this.display = {};
		} else {
			var display = document.createElement('div');
			display.id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
				return v.toString(16);
			});
			display.style = "background-color:white;padding:6px;";
			display.innerHTML = "Fetching blocks...";
			document.getElementById(updateId).innerHTML = '';
			document.getElementById(updateId).appendChild(display);
			this.display = display;
		}
		 
		this.blocks = blocks;
		this.count = 0;
		this.total = blocks.length;
		this.failed = [];
		
		this.update = function(block) {
			var index = this.blocks.indexOf(block);
			if (index !== -1) {
				this.blocks.splice(index, 1);
				this.count++;
				this.display.innerHTML = "Fetched " + this.count + " / " + this.total;
			}
		};
		
		this.failure = function(block) {
			console.log("failed to load: " + block);
			this.failed.push(block);
			var index = this.blocks.indexOf(block);
			if (index !== -1) {
				this.blocks.splice(index, 1);
			}
		}
	};
	
	var status = new Status(updateId,blocks);
	
	// pick up on 404 script load errors
	function failedBlockFunc(e) {
		if(e.target.tagName === "SCRIPT") {
			var blockName = e.target.src.split("/").pop().split(".")[0];
			if(typeof blockName !== "undefined") {
				status.failure(blockName);
			}
		}
		if(e.target.tagName === "LINK") {
			var blockName = e.target.href.split("/").pop().split(".")[0];
			if(typeof blockName !== "undefined") {
				status.failure(blockName);
			}
		}
	};
	
	window.addEventListener('error',failedBlockFunc,true);
	
	// add Bengine dependencies here
	blocks = blocks.concat(Bengine.libs['#']);
	
	// append block script to load javascript
	blocks.forEach(function(block) {
		if(block.indexOf(".css") > -1) {
			var stylesheet = document.createElement('link');
			document.getElementsByTagName('head')[0].appendChild(stylesheet);
			
			stylesheet.onload = function(e) {
				status.update(block);
			};
			
			stylesheet.rel = "stylesheet";
			stylesheet.defer = true;
			stylesheet.href = block;
		} else {
			var scripts = document.createElement('script');
			document.getElementsByTagName('head')[0].appendChild(scripts);

			scripts.async = false;
			scripts.type = 'text/javascript';
			scripts.onload = function(e) {
				status.update(block);
				
			    var sc = e.path[0].src.split('/');
			    var dep = sc[sc.length-1].split('.')[0];
			    switch(dep) {
				    case 'jszip':
				        Bengine.libs.zip = JSZip; break;
				    case 'FileSaver':
				        Bengine.libs.file = { saveAs:window.saveAs }; break;
				    default:
			    }
			};
			
			if(block.indexOf("http") > -1 && block.indexOf("//") > -1) {
				if(block.indexOf("RELATIVE") > -1) {
					var url = block.split("/").slice(3).join("/");
					scripts.src = url;
				} else {
					scripts.src = block;
				}
			} else {
				if(Bengine.minifiedMode) {
					scripts.src = Bengine.benginePath + '/blocks/' + block + ".min.js";
				} else {
					scripts.src = Bengine.benginePath + '/blocks/' + block + ".js";
				}
			}
		}
	});
	
	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	};
	
	async function waitForAllBlocks(resolve,reject) {		
		var tries = 0;
		var limit = 100;
		
		while((status.count + status.failed.length) < status.total && tries < limit) {
			await sleep(50);
			tries++;
		}
		
		window.removeEventListener('error',failedBlockFunc);

		resolve(status.failed);
	};
	
	return new Promise(waitForAllBlocks);
};

Bengine.extensibles = {};

// wrapper function for starting Bengine in 'qengine' mode
function Qengine(options,extensions) {
	if(typeof options !== 'object') var coptions = {}; else var coptions = options;
	coptions.mode = 'qengine';
	return new Bengine(coptions,extensions);
}

