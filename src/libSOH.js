"use strict"

function readSOHFtypBox(dataView, offset, dataOffset, size) {
	var result={};
	result.majorBrand=getSOHString(dataView, offset, offset+4)
	result.minorVersion=dataView.getUint32(4);
	offset+=8;
	if (offset<size-dataOffset-3) {
		result.compatibleBrands=[];
		while(offset<size-dataOffset-3)
		{
			result.compatibleBrands.push(getSOHString(dataView, offset, offset+4));
			offset+=4;
		}
	}
	return result;
}


async function readSOHFtypBoxURL(url, fileInfo) {

	var i=getIndexSOHBoxType(fileInfo.boxes, "ftyp");
	if (i==-1)
		return;

	var result=await readSOHBoxURL(url, fileInfo.boxes[i].start, fileInfo.fileSize);
	return readSOHFtypBox(result.dataView, 0, result.dataOffset, result.size);
}


async function readSOHBoxDumpURL(url, limit, divIdBox, showDump) {
	var start = 0, result, array=[];
	var fileSize=await getURLSize(url);

	while (result=await readSOHBoxURL(url, start, fileSize, limit)) {
		array.push(result);
		if (showDump)
			showDump({boxes: array}, divIdBox);
		if (result.type=='meta' && result.dataView && result.dataView.getUint32(0)==0) {
			var startBox=start + 12;
			var endBox=result.size+start;
			var resultBox;
			while (resultBox=await readSOHBoxURL(url, startBox, fileSize, limit)) {
				resultBox.type='meta'+'/'+resultBox.type;
				array.push(resultBox);
				if (showDump)
					showDump({boxes: array}, divIdBox);
				startBox+=resultBox.size;
				if (startBox>=endBox)
					break;
			};
		}	
		start+=result.size;
		if (start>=fileSize)
			break;
	};
	return {boxes: array, fileSize: fileSize};
}

function getIndexSOHBoxType(boxes, type) {
	for (var i=0; i<boxes.length; i++) {
		if (boxes[i].type==type)
			return i;
	}
	return -1;
}

function getIndexSOHItemID(items, itemId) {
	for (var i=0; i<items.length; i++) {
		if (items[i].itemId==itemId)
			return i;
	}
	return -1;
}

function getUIntegerByteSize(dataView, offset, byteSize) {
	if (byteSize==4)
		return dataView.getUint32(offset);
	if (byteSize==8)
		return dataView.getUint64(offset);
	return 0;
}

function readSOHIspe(dataView, offset, start, fileSize) {
	var result=readSOHFullBox(dataView, offset, start, fileSize);
	offset+=result.dataOffset;
	result.imageWidth=dataView.getUint32(offset);
	result.imageHeight=dataView.getUint32(offset+4);
	result.dataOffset+=8;
	return result;
}

function readSOHPixi(dataView, offset, start, fileSize) {
	var result=readSOHFullBox(dataView, offset, start, fileSize);
	offset+=result.dataOffset;
	var numChannels=dataView.getUint8(offset);
	offset++;
	result.bitsPerChannels=[];
	for (var i=0; i<numChannels; i++)
		result.bitsPerChannels.push(dataView.getUint8(offset+i)); 
	result.dataOffset+=1+numChannels;
	return result;
}

const possibleOffsetTileLengths=[32, 40, 48, 64];
const possibleSizeTileLengths=[0, 24, 32, 64];
function readSOHTilC(dataView, offset, start, fileSize) {
	var offsetIni=offset;
	var result=readSOHFullBox(dataView, offset, start, fileSize);
	offset+=result.dataOffset;
	result.tileWidth=dataView.getUint32(offset);
	result.tileHeight=dataView.getUint32(offset+4);

	result.offsetTileLength=possibleOffsetTileLengths[result.flags&0x03]
	result.sizeTileLength=possibleSizeTileLengths[(result.flags>>2) & 0x03];
	result.areTileOffsetsSequential=(result.flags & 0x10) ? true : false;

	result.tileCompressionType=getBoxType(dataView, offset+8);

	var numberOfExtraDimensions=dataView.getUint8(offset+12);
	offset+=13;
	if (numberOfExtraDimensions) {
		result.extraDimensionSizes=[];
	  	for (var i=0; i<numberOfExtraDimensions; i++) { 
			result.extraDimensionSizes[i].push(dataView.getUint32(offset));
			offset+=4;
		}
	}

	var numberOfTileProperties=dataView.getUint8(offset);
	offset+=1;
	var prop;
	if (numberOfTileProperties) {
		result.tileProperties=[];
	  	for (var i=0; i<numberOfTileProperties; i++) { 
			prop=readSOHBox(dataView, offset, start, fileSize);
			result.tileProperties[i]=prop.type;
			offset+=prop.size;
		}
	}
	result.dataOffset+=offset-offsetIni;

	return result;
}

function copyPropertiesIpcoBox(item, prop) {
	var propArray=Object.keys(prop);
	for (var i=0; i<propArray.length; i++){
		if (propArray[i]=="size" || propArray[i]=="type" || propArray[i]=="dataOffset" || propArray[i]=="version" || propArray[i]=="flags")
			continue;
		item[propArray[i]]=prop[propArray[i]];
	}
}

async function readSOHItemsDumpURL(url, sidecarUrl, fileInfo, divIdItem, showDump) {
	var result, resultItem, offset, offsetItem, entryCount;

	var i=getIndexSOHBoxType(fileInfo.boxes, "meta/iinf");
	if (i==-1)
		return;

	//Reading iinf as a FullBox 
	var start=fileInfo.boxes[i].start;
	result=await readSOHBoxURL(url, start, fileInfo.fileSize);
	var dvOffset=result.dataOffset;
	var dataView=result.dataView;
	result.version=getFullBoxVersion(dataView, 0);
	result.flags=getFullBoxFlags(dataView, 1);
	
	if (result.version==0) {
		entryCount=dataView.getUint16(4);
		offset=6;
	} else {
		entryCount=dataView.getUint32(4);
		offset=8;
	}

	var items=[];
	for (var i=0; i<entryCount; i++) {
		offsetItem=offset;
		resultItem=readSOHFullBox(dataView, offset, start, fileInfo.fileSize);
		offset+=resultItem.dataOffset;
		items.push(resultItem);
		if (resultItem.type=="infe") {
			if (resultItem.version == 0 || resultItem.version == 1) {
				items[i].itemId=dataView.getUint16(offset);
				offset+=2;
				items[i].itemProtectionIndex=dataView.getUint16(offset);
				offset+=2;

				items[i].itemName=getSOHString(dataView, offset, offsetItem+resultItem.size);
				offset+=getSOHStringSize(items[i].itemName, offset, offsetItem+resultItem.size);

 				items[i].contentType=getSOHString(dataView, offset, offsetItem+resultItem.size);
				offset+=getSOHStringSize(items[i].contentType, offset, offsetItem+resultItem.size);

				items[i].contentEncoding=getSOHString(dataView, offset, offsetItem+resultItem.size);
				offset+=getSOHStringSize(items[i].contentEncoding, offset, offsetItem+resultItem.size);
			} else {
				if (resultItem.version == 2) { 
					items[i].itemId=dataView.getUint16(offset);
					offset+=2;
				} else if (resultItem.version == 3) { 
					items[i].itemId=dataView.getUint32(offset);
					offset+=4;
				}
				items[i].itemProtectionIndex=dataView.getUint16(offset);
				offset+=2;
				items[i].itemType=getBoxType(dataView, offset);
				offset+=4;

				items[i].itemName=getSOHString(dataView, offset, offsetItem+resultItem.size)
				offset+=getSOHStringSize(items[i].itemName, offset, offsetItem+resultItem.size);;
				if (items[i].itemType=='mime') { 
	 				items[i].contentType=getSOHString(dataView, offset, offsetItem+resultItem.size); 
					offset+=getSOHStringSize(items[i].contentType, offset, offsetItem+resultItem.size);

					items[i].contentEncoding=getSOHString(dataView, offset, offsetItem+resultItem.size);
					offset+=getSOHStringSize(items[i].contentEncoding, offset, offsetItem+resultItem.size);
 				} else if (items[i].itemType == 'uri ') {
					items[i].itemUriType=getSOHString(dataView, offset, offsetItem+resultItem.size);
					offset+=getSOHStringSize(items[i].itemUriType, offset, offsetItem+resultItem.size);
				}
 			}
  		}
		if (showDump && (entryCount<20 || i%Math.trunc(entryCount/20)==0))
			showDump(items, divIdItem);
	}
	if (showDump && entryCount>=20)
		showDump(items, divIdItem);

	var idat=getIndexSOHBoxType(fileInfo.boxes, "meta/idat");  //in case constructionMethod==1;

	var i=getIndexSOHBoxType(fileInfo.boxes, "meta/iloc");
	if (i==-1)
		return items;

	//Reading iloc as a FullBox 
	var start=fileInfo.boxes[i].start;
	result=await readSOHBoxURL(url, start, fileInfo.fileSize);
	var dvOffset=result.dataOffset
	var dataView=result.dataView;
	result.version=getFullBoxVersion(dataView, 0);
	result.flags=getFullBoxFlags(dataView, 1);

	result.offsetSize=dataView.getUint8(4)>>4;
	result.lengthSize=dataView.getUint8(4)&0x0F;
	result.baseOffsetSize=dataView.getUint8(5)>>4; 
	if (result.version == 1 || result.version == 2)
		result.indexSize=dataView.getUint8(5)&0x0F; 
	else {
		result.indexSize=0;
	//	result.reserved=dataView.getUint8(5)&0x0F;
	}

	if (result.version < 2) {
		result.itemCount=dataView.getUint16(6);
		offset=8;
	}
	else if (result.version == 2) { 
 		result.itemCount=dataView.getUint32(6);
		offset=10;
	}
	var itemId, item, constructionMethod;
	for (i=0; i<result.itemCount; i++) { 
		if (result.version < 2) { 
			itemId=dataView.getUint16(offset);
			offset+=2;
		} else if (result.version == 2) { 
			itemId=dataView.getUint32(offset);
			offset+=4;
		}

		var z=getIndexSOHItemID(items, itemId);
		if (z==-1)
			continue;
		item=items[z];
		if (result.version == 1 || result.version == 2) { 
			//unsigned int(12) reserved = 0; 
			constructionMethod=dataView.getUint16(offset)&0x0F;
			offset+=2;
		}
		else
			constructionMethod=0;
		//data_reference_index=dataView.getUint16(offset)  //the origin of the offset is the beginning of the file identified by the data_reference_index
		offset+=2;
		var baseOffset=getUIntegerByteSize(dataView, offset, result.baseOffsetSize);
		offset+=result.baseOffsetSize;
		var extentCount=dataView.getUint16(offset);
		offset+=2;
		item.extents=[];
		for (var j=0; j<extentCount; j++) {
			item.extents.push({});
			if ((result.version == 1 || result.version == 2) && result.indexSize > 0) { 
				item.extents[j].extentIndex=getUIntegerByteSize(dataView, offset, result.indexSize);
				offset+=result.baseOffsetSize;
 			}
			else
				item.extents[j].extentIndex=0;
			item.extents[j].extentOffset=getUIntegerByteSize(dataView, offset, result.offsetSize)+baseOffset;
			offset+=result.offsetSize;
			if (idat!=-1 && constructionMethod==1) 
				item.extents[j].extentOffset+=fileInfo.boxes[idat].start+fileInfo.boxes[idat].dataOffset;
			item.extents[j].extentLength=getUIntegerByteSize(dataView, offset, result.lengthSize);
			offset+=result.lengthSize;
		} 
		if (showDump && (result.itemCount<20 || i%Math.trunc(result.itemCount/20)==0))
			showDump(items, divIdItem);
	}
	if (showDump && result.itemCount>=20)
		showDump(items, divIdItem);
	
	var i=getIndexSOHBoxType(fileInfo.boxes, "meta/iprp");
	if (i==-1)
		return items;
	//Reading iloc as a FullBox 
	var start=fileInfo.boxes[i].start;
	result=await readSOHBoxURL(url, start, fileInfo.fileSize);
	var dvOffset=result.dataOffset
	var dataView=result.dataView;

	//read 'ipco'
	result=readSOHBox(dataView, 0, start, fileInfo.fileSize);
	offset=result.dataOffset;
	if (result.type!='ipco') {
		console.log("Unexpected section in 'meta/iprp':" + result.type);
		return items;
	}

	var props=[], prop;
	while (result.size>offset){
		prop=readSOHBox(dataView, offset, start, fileInfo.fileSize);
		//Details of reading each individual box
		if (prop.type=="ispe")
			prop=readSOHIspe(dataView, offset, start, fileInfo.fileSize);
		else if (prop.type=="pixi")
			prop=readSOHPixi(dataView, offset, start, fileInfo.fileSize);
		else if (prop.type=="tilC")
			prop=readSOHTilC(dataView, offset, start, fileInfo.fileSize);
		else if (prop.type=="uuid") 
			prop.contentId=getSOHString(dataView, offset+prop.dataOffset, offset+prop.size);

		props.push(prop);
		offset+=prop.size;
	}
	result=readSOHFullBox(dataView, offset, start, fileInfo.fileSize);
	offset+=result.dataOffset;
	if (result.type!='ipma') {
		console.log("Unexpected section in 'meta/iprp':" + result.type);
		return items;
	}
	entryCount=dataView.getUint32(offset);
	offset+=4;
	var associationCount, propIndex;
	for(var i=0; i<entryCount; i++) { 
		if (result.version < 1) {
			itemId=dataView.getUint16(offset);
			offset+=2;
		}
         	else 
		{
			itemId=dataView.getUint32(offset);
			offset+=4;
		}

		var z=getIndexSOHItemID(items, itemId);
		if (z==-1)
			continue;
		item=items[z];
		var associationCount=dataView.getUint8(offset);
		offset+=1;
		item.associations=[];
		for (j=0; j<associationCount; j++) {
			item.associations.push({});
			if (dataView.getUint8(offset)&0x80)
				item.associations[j].essential=true; 
			if (result.flags & 1) {
				propIndex=dataView.getUint16(offset)&0x7FFF;
				offset+=2;
			} else {
				propIndex=dataView.getUint8(offset)&0x7F;
				offset+=1;
			}
			propIndex--;
			if (propIndex<props.length) {
				item.associations[j].type=props[propIndex].type;
				if (props[propIndex].type=="ispe" || props[propIndex].type=="pixi" || props[propIndex].type=="uuid" || props[propIndex].type=="tilC")
					copyPropertiesIpcoBox(item, props[propIndex]);
			}
		}

		//Calculating number of tiles
		if (item.tileWidth && item.imageWidth && item.tileHeight && item.imageHeight) {
			item.matrixWidth = Math.trunc((item.imageWidth + item.tileWidth -1)/item.tileWidth);
			item.matrixHeight = Math.trunc((item.imageHeight + item.tileHeight -1)/item.tileHeight);
			var nTiles = item.matrixWidth * item.matrixHeight;
			if (item.extraDimensionSizes &&item.extraDimensionSizes.length) {
				for (var k=0; k<item.extraDimensionSizes.length; z++)
					nTiles *= item.extraDimensionSizes[z];
			}
			var sizeMdatTileHeader=(item.offsetTileLength+item.sizeTileLength)/8*nTiles;
			if (item.extents.length>1 && sizeMdatTileHeader>item.extents[0].extentLength) {
				console.log("Offsets of the tiles in 'mdat' box are in two or more separate chucks. This is not supported.");
				sizeMdatTileHeader=item.extents[0].extentLength;
			}
			var headerOffsetBuffer=await getURLBuffer(url, item.extents[0].extentOffset, item.extents[0].extentOffset+sizeMdatTileHeader-1);
			var headerOffsetDV = new DataView(headerOffsetBuffer);
			var offsetHeader=0;
			if (headerOffsetDV) {
				item.tiles=[];
				for (j=0; j<nTiles; j++) {
					item.tiles.push({});
					switch(item.offsetTileLength) {
						case 32:
							item.tiles[j].offset=headerOffsetDV.getUint32(offsetHeader);
							break;
						case 40:
							item.tiles[j].offset=headerOffsetDV.getUint32(offsetHeader)*256 + 
										headerOffsetDV.getUint8(offsetHeader+4);
							break;
						case 48:
							item.tiles[j].offset=headerOffsetDV.getUint32(offsetHeader)*65536 + 
											headerOffsetDV.getUint16(offsetHeader+4);
							break;
						case 64:
							item.tiles[j].offset=headerOffsetDV.getBigUint64(offsetHeader);
							break;
					}
					offsetHeader+=item.offsetTileLength/8;
					switch(item.sizeTileLength) {
						case 0:
							if (item.areTileOffsetsSequential && j>0)
								item.tiles[j-1].size=item.tiles[j].offset-item.tiles[j-1].offset;
						case 24:
							item.tiles[j].size=headerOffsetDV.getUint16(offsetHeader)*256 + 
										headerOffsetDV.getUint8(offsetHeader+2);
							break;
						case 32:
							item.tiles[j].size=headerOffsetDV.getUint32(offsetHeader);
							break;
						case 64:
							item.tiles[j].size=headerOffsetDV.getBigUint64(offsetHeader);
							break;
					}
					offsetHeader+=item.sizeTileLength/8;
				}
				if (item.sizeTileLength==0 && item.areTileOffsetsSequential)
					item.tiles[nTiles-1].size=(nTiles>1) ? item.extents[0].extentOffset+item.extents[0].extentLength-item.tiles[nTiles-2].offset : //The end of the box minus the last offset
								item.extents[0].extentLength-sizeMdatTileHeader;
  			}
		}
		if (showDump && (entryCount<20 || i%Math.trunc(entryCount/20)==0))
			showDump(items, divIdItem);
	}
	if (showDump && entryCount>=20)
		showDump(items, divIdItem);

	var i=getIndexSOHBoxType(fileInfo.boxes, "meta/iref");
	if (i!=-1) {
		//Reading iloc as a FullBox 
		start=fileInfo.boxes[i].start;
		result=await readSOHBoxURL(url, start, fileInfo.fileSize);
		var dvOffset=result.dataOffset;
		var dataView=result.dataView;
		result.version=getFullBoxVersion(dataView, 0);
		result.flags=getFullBoxFlags(dataView, 1);
		offset=4;
		var mdat=getIndexSOHBoxType(fileInfo.boxes, "mdat");
		if (mdat==-1)
			return items;
		var offsetMdat=fileInfo.boxes[mdat].start;

		var rel, itemRel, fromItemId, toItemId, referenceCount, offsetRel;
		while (result.size>offset+result.dataOffset){
			rel=readSOHBox(dataView, offset, start, fileInfo.fileSize);
			offsetRel=offset+rel.dataOffset;
			if (rel.type=='dimg') {
				if (result.version==0) {
					fromItemId=dataView.getUint16(offsetRel);
					offsetRel+=2;
				} else {
					fromItemId=dataView.getUint32(offsetRel);
					offsetRel+=4;
				}
				//Look for the itemId.
				var z=getIndexSOHItemID(items, fromItemId);
				if (z==-1) {
					offset+=rel.size;
					continue;
				}
				item=items[z];
				if (item.itemType!='grid') {
					offset+=rel.size;
					continue;
				}									
				referenceCount=dataView.getUint16(offsetRel);
				offsetRel+=2;
				for (j=0; j<referenceCount; j++) {
					if (result.version==0) {
						toItemId=dataView.getUint16(offsetRel);
						offsetRel+=2;
					} else {
						toItemId=dataView.getUint32(offsetRel);
						offsetRel+=4;
					}
					var zz=getIndexSOHItemID(items, toItemId);
					if (zz==-1)
						continue;
					itemRel=items[zz];
					itemRel.isTile=true;
					if (!item.tileWidth && !item.tileHeight) {
						item.tileWidth=itemRel.imageWidth;
						item.tileHeight=itemRel.imageHeight;
						item.matrixWidth = Math.trunc((item.imageWidth + item.tileWidth -1)/item.tileWidth);
						item.matrixHeight = Math.trunc((item.imageHeight + item.tileHeight -1)/item.tileHeight);
					}
					if (!item.tiles)
						item.tiles=[];
					if (itemRel.extents && itemRel.extents.length>0)
						item.tiles.push({offset: itemRel.extents[0].extentOffset-offsetMdat, size: itemRel.extents[0].extentLength});
				}
				if (!item.tiles || item.tiles.length<item.matrixWidth*item.matrixHeight)
					console.log("This grid item (id:" + item.itemId + ") requires "+item.matrixWidth*item.matrixHeight+" but it only contains " + item.tiles.length + " tiles");
				if (showDump)
					showDump(items, divIdItem);		
			}
			offset+=rel.size;
		}		
	}

	if (sidecarUrl) {
		addGeoreferenceToItems(items, await getURLText(sidecarUrl));
		if (showDump)
			showDump(items, divIdItem);
	} else {
		for (var i=0; i<items.length; i++) {
			if (items[i].itemType=='mime' && items[i].contentType=="text/turtle" && items[i].extents && items[i].extents.length) {
				addGeoreferenceToItems(items, await getURLText(url, items[i].extents[0].extentOffset, items[i].extents[0].extentOffset+items[i].extents[0].extentLength-1));
				if (showDump)
					showDump(items, divIdItem);
				break;
			}
		}
	}
	var group, itemId;
	if (fileInfo.groups && fileInfo.groups.length) {
		for (var i=0; i<fileInfo.groups.length; i++) {
			if (fileInfo.groups[i].type=='pymd') {
				var group=fileInfo.groups[i];
				for (var j=0; j<items.length; j++) {
					item=items[j];
					for (var e=0; e<group.entities.length; e++) {
						if (group.entities[e].itemId==item.itemId) {
							item.pyramidId=group.groupId;
							item.sizeMultiple=group.entities[e].sizeMultiple;
							break;
						}
					}					
				}
				if (showDump)
					showDump(items, divIdItem);
			}
		}		
	}
	return items;
}

function addSOHPymd(group, dataView, offset){
	group.tileWidth=dataView.getUint16(offset);
	group.tileHeight=dataView.getUint16(offset+2);
	offset+=4;
	for (var i=0; i<group.entities.length; i++)
	{
		group.entities[i].sizeMultiple=dataView.getUint16(offset);      //layer_binning
		group.entities[i].matrixHeight=dataView.getUint16(offset+2)+1;   //tiles_in_layer_row_minus1+1
		group.entities[i].matrixWidth=dataView.getUint16(offset+4)+1;  //tiles_in_layer_column_minus1+1
		offset+=6;
	}
}

async function readSOHGroupsDumpURL(url, fileInfo, divIdGroups, showDump) {
	var result, resultItem, offset, offsetItem, entryCount;

	var i=getIndexSOHBoxType(fileInfo.boxes, "meta/grpl");
	if (i==-1)
		return;

	//Reading grpl as a Box 
	var start=fileInfo.boxes[i].start;
	result=await readSOHBoxURL(url, start, fileInfo.fileSize);
	offset=0;
	var dataView=result.dataView;

	var groups=[], group;
	while (result.size>offset+result.dataOffset){
		group=readSOHFullBox(dataView, offset, start, fileInfo.fileSize);
		var groupOffset=offset+group.dataOffset;
		group.groupId=dataView.getUint32(groupOffset);
		var numEntitiesInGroup=dataView.getUint32(groupOffset+4);
		groupOffset+=8;
		if (numEntitiesInGroup) {
			group.entities=[];
			for (var i=0; i<numEntitiesInGroup; i++) {
				group.entities[i]={itemId: dataView.getUint32(groupOffset)};
				groupOffset+=4;
			}
		}
		//Details of reading each individual box
		if (group.type=="pymd") {
			addSOHPymd(group, dataView, groupOffset);
		}

		groups.push(group);
		offset+=group.size;
		if (showDump)
			showDump(groups, divIdGroups);
	}
	return groups;
}

async function getURLBuffer(url, begin, end){
	var options=(begin || end) ? {headers: {
        	    'range': 'bytes='+begin+'-'+end
	        }} : null;

	var response=await fetch(url, options);
	if (!response?.ok) {
		return;
	}
	return await response.arrayBuffer();
}

async function getURLText(url, begin, end){
	var options=(begin || end) ? {headers: {
        	    'range': 'bytes='+begin+'-'+end
	        }} : null;

	var response=await fetch(url, options);
	if (!response?.ok) {
		return;
	}	
	return await response.text();
}

async function getURLSize(url){
	var response=await fetch(url, {
		method: "HEAD"
    	});
	if (!response?.ok) {
		return;
	}
	if (response.headers.get('Content-Length')==null)
		return;
	return parseInt(response.headers.get('Content-Length'));
}

function getBoxSize(dataView, offset, start, fileSize){
	var size=dataView.getUint32(offset);
	/*if (size==1) {  //It is considered later.
		console.log("Size=1 not implemented");
		return;
	}*/
	if (size==0) 
		size=fileSize-start;
	return size;
}

async function getBoxLargeSizeURL(url, begin, end, fileSize){
			
	if (fileSize - begin + 1 < 8) {
		console.log("Not enough file size to parse the largesize of the box");
		return;
	}	
	var buffer=await getURLBuffer(url, begin, end);
	if(!buffer)
		return;	
	var dataView = new DataView(buffer);
	if(!dataView)
		return;	
	var large_size=dataView.getUint64(0);
	return large_size;	
}

function getFullBoxVersion(dataView, offset) {
	return dataView.getUint8(offset);
}

function getFullBoxFlags(dataView, offset) {
	return dataView.getUint8(offset+2)+dataView.getUint8(offset+1)*256+dataView.getUint8(offset)*256*256;
}

function getBoxType(dataView, offset){
	return String.fromCharCode(dataView.getUint8(offset))+String.fromCharCode(dataView.getUint8(offset+1))+
		String.fromCharCode(dataView.getUint8(offset+2))+String.fromCharCode(dataView.getUint8(offset+3));
}

function getSOHString(dataView, offset, size){
	var s="";
	for (var i=0; offset<size; i++) {
		if (dataView.getUint8(offset)==0)
			return s;
		s+=String.fromCharCode(dataView.getUint8(offset));
		offset++;
	}
	return s;
}

function getSOHStringSize(s, offset, size){
	var l=s.length;
	if (offset<size)
		l++;
	return l;
}

function getBoxUUIDType(dataView, offset){
	var s="", h;
	for (var i=0; i<4; i++) {
		h=dataView.getUint8(offset+i).toString(16).toLowerCase();
		s+=h.length==1 ? "0"+h : h;
	}
	s+="-"
	for (var i=4; i<6; i++) {
		h=dataView.getUint8(offset+i).toString(16).toLowerCase();
		s+=h.length==1 ? "0"+h : h;
	}
	s+="-"
	for (var i=6; i<8; i++) {
		h=dataView.getUint8(offset+i).toString(16).toLowerCase();
		s+=h.length==1 ? "0"+h : h;
	}
	s+="-"
	for (var i=8; i<16; i++) {
		h=dataView.getUint8(offset+i).toString(16).toLowerCase();
		s+=h.length==1 ? "0"+h : h;
	}
	return s;
}

//result.dataOffset is number of bytes between the start the box and the start of the data (the size of the headers of a box; not the offset for the start of dataView)
function readSOHBox(dataView, offset, start, fileSize){
	var dataOffset=offset;
	var size=getBoxSize(dataView, offset, start, fileSize);
	var type=getBoxType(dataView, offset+4);
	offset+=8; 
	if (size==1) {
		size=dataView.getUint64(offset+8)
		offset+=8;
	}
	if (type=="uuid") {
		var userType=getBoxUUIDType(dataView, offset);
		offset+=16;
	}
	var result={start: start, size: size, type: type, dataOffset: offset-dataOffset}
	if (type=="uuid")
		result.userType=userType;
	return result;	
}

//result.dataOffset is number of bytes between the start the full box and the start of the data (the size of the headers of a full box; not the offset for the start of dataView)
function readSOHFullBox(dataView, offset, start, fileSize){
	var result=readSOHBox(dataView, offset, start, fileSize);
	result.version=getFullBoxVersion(dataView, offset+result.dataOffset);
	result.flags=getFullBoxFlags(dataView, offset+result.dataOffset+1);
	result.dataOffset+=4;
	return result;
}

/* limit==-1: Do not read the data (dataView is undefined in the return)
   limit==0 (or undefined): No limit; read the complete data. */
async function readSOHBoxURL(url, start, fileSize, limit){	
	if (fileSize - start + 1 < 8) {
		console.log("Not enough file size to parse the type and size of the box");
		return;
	}	
	var begin=start, end=begin+7, dataOffset=8;	
	var buffer=await getURLBuffer(url, begin, end);
	if(!buffer)
		return;
	var dataView = new DataView(buffer);
	if(!dataView)
		return;
		
	// size
	var size = getBoxSize(dataView, 0, begin, fileSize);
	// boxtype
	var type=getBoxType(dataView, 4);

	if (size==1) {		
		// the size is a largesize
		begin=end+1;
		end=begin+7;
		var size = getBoxLargeSizeURL(url, begin, end, fileSize);
		dataOffset+=8;		
	}	

	if (size==dataOffset)   //This is an empty box
		return {start: start, size: size, type: type, dataOffset: dataOffset};

	if (type=="uuid") {
		begin=end+1;
		end=begin+15;
		buffer=await getURLBuffer(url, begin, end);
		dataView = new DataView(buffer);
		if(!dataView)
			return;
		type=getBoxUUIDType(dataView, 0);
		dataOffset+=16;		
	}
		
	if (size==dataOffset ||   //This is an empty box
	    (limit && limit==-1)) //Do not read the content 
  		return {start: start, size: size, type: type, dataOffset: dataOffset};

	begin=start+dataOffset;
	end=(limit && (size-dataOffset)>limit) ? begin+limit-1 : start+size-1;
	buffer=await getURLBuffer(url, begin, end);
	if(!buffer)
		return;
	dataView = new DataView(buffer);
	if (!dataView) {
		console.log("Failure in reading the content for the '" + type + "' section");
		return;
	}

	return {start: start, size: size, type: type, dataOffset: dataOffset, dataView: dataView};
}

function addGeoreferenceToItems(items, ttl){
	const jsonld = ttl2jsonld.parse(ttl);
	for (var i=0; i<items.length; i++) {
		if (!items[i].contentId)
			continue;
		for (var j=0; j<jsonld["@graph"].length; j++) {
			if (!jsonld["@graph"][j]["cco:ont00001808"] || jsonld["@graph"][j]["cco:ont00001808"]["@id"]!=items[i].contentId)
				continue;
			items[i].wkt=jsonld["@graph"][j]["geosparql:asWKT"]["@value"];
			break;
		}
	}
}

