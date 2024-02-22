import { React, AllWidgetProps } from 'jimu-core';
import { useEffect, useRef, useState } from 'react';
import { IMConfig } from '../config';
import { DataSourceManager } from 'jimu-core';
import FeatureLayer  from 'esri/layers/FeatureLayer';
import { Select, Option, Loading, Button, Tooltip } from 'jimu-ui';
import { RefreshOutlined } from 'jimu-icons/outlined/editor/refresh'

import DataSet from '@antv/data-set';
import { Chart, Polygon } from 'bizcharts';
import StatisticDefinition from 'esri/rest/support/StatisticDefinition';
import { MapViewManager } from 'jimu-arcgis';

const { DataView } = DataSet;

 export default function Widget(props: AllWidgetProps<IMConfig>, any) {

  const dsManager = DataSourceManager.getInstance();
  const initDataSources = dsManager.createAllDataSources();

  const [featureLayers, setFeatureLayers] = useState<FeatureLayer[]>([]);
  const [currentFeatureLayer, setCurrentFeatureLayer] = useState<FeatureLayer>(null);
  const [currentAttributes, setCurrentAttributes] = useState([]);
  const [selectedAttribute, setSelectedAttribute] = useState("");
  const [currentChartData, setData] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [containerHeight, setHeight] = useState(0);

  const refContainer = useRef(null);

  // set the height of the TreeMap
  useEffect(() => {
    if (refContainer.current) {
      setHeight(refContainer.current.offsetHeight);
    }
  }, []);

  window.onresize = (e: any) => {
    if (refContainer.current) {
      setHeight(refContainer.current.offsetHeight);
    }
  };

  // load the layers in the map
  if (!isLoaded) {
    initDataSources.then((ds) => {
      if (!ds || ds.length === 0) {
        ds = dsManager.getDataSourcesAsArray().filter(d => d.type === "WEB_MAP");
      }

      var featureLayers = [];
      var urls = [];
      var titles = [];

      ds.map((d) => {
        // everything in the webmap
        if (d.type === "WEB_MAP") {
          let children = d.getChildDataSources();

          children.map((c) => {
            let url = c.getDataSourceJson().url;

            // look for feature layers
            if (url && !urls.includes(url)) {
              if (c.type === "FEATURE_LAYER") {
                let layer = new FeatureLayer({url: url});
                if (!titles.includes(layer.title)) {
                  featureLayers.push(layer);
                  urls = [...urls, url];
                  titles = [...titles, layer.title];
                }
              }
              else if(c.type === "MAP_SERVICE") {
                let chilChil = c.getAllChildDataSources();

                chilChil.map((c) => {
                  let url = c.getDataSourceJson().url;
      
                  if (url && !urls.includes(url)) {
                    let layer = new FeatureLayer({url: url});
                    if (!titles.includes(layer.title)) {
                      featureLayers.push(layer);
                      urls = [...urls, url];
                      titles = [...titles, layer.title];
                    }
                  }
                });
              }
            }
          });
        }
      });

      setIsLoaded(true);
      setFeatureLayers(featureLayers);
      
    });
  }

  // when the layer drop down is changed
  const layerChange = (layerName: string) => {
      var featureLayer = featureLayers.filter(f => f.title === layerName)[0];

      let query = {
        where: '1=1',
        returnGeometry: false,
        outFields: ['*'],
        num: 1
      };

      featureLayer.queryFeatures(query)
        .then(data => {

          if (!data || data.features.length === 0) {
            return;
          }

          let attributes = Object.keys(data.features[0].attributes).filter(a => a.toUpperCase() !== "OBJECTID");

          setCurrentFeatureLayer(featureLayer);
          setCurrentAttributes(attributes);
          setSelectedAttribute("");
          setData([]);
        });
  };

  // when an attribute is selected in the dropdown or the refresh button is clicked
  const attributeChange = (field: string) => {

      setSelectedAttribute(field);

      const mvManager = MapViewManager.getInstance();
      const geometry = mvManager
                          .getJimuMapViewById(mvManager.getAllJimuMapViewIds()[0])
                          .view
                          .extent;

      const key = field + "_99";

      let query = currentFeatureLayer.createQuery();

      query.spatialRelationship = 'intersects';
      query.geometry = geometry;
      let outStatistics = new StatisticDefinition({
        onStatisticField: field,
        outStatisticFieldName: key,
        statisticType: 'count'
      });

      query.outStatistics = [outStatistics];
      query.groupByFieldsForStatistics = [field];


      // let actualField = currentFeatureLayer.fields.filter(f => f.name === field)[0];

      // let numbers = ['integer', 'small-integer', 'long', 'double', 'single'];
      // let isNumber = actualField.type

      currentFeatureLayer.queryFeatures(query)
        .then(data => {
            if (!data || data.features.length === 0) {
              console.log("no results in query");
              return;
            }

            let keyMap = {};

             // pull the data from the statistics query
             data.features.forEach(f => {
                if(f.attributes[field] && f.attributes[field].length > 0) {
                  keyMap[f.attributes[field] + " (" + f.attributes[key] + ")"] = f.attributes[key];
                }
             });

             let children = [];
             let keys = Object.keys(keyMap);

             keys.forEach(k => {
                children.push({name: k, value: keyMap[k]});
             });

             // prepare the data for the component
             children.sort((a, b) => {
                if (a.value < b.value) {
                  return 1;
                }
                else if(a.value > b.value) {
                  return -1;
                }
                return 0;
             });

             const chartData = {
               name: 'root',
               children: children
             };

             const dv = new DataView();
             dv.source(chartData, { type: 'hierarchy'}).transform({
              field: 'value',
              type: 'hierarchy.treemap',
              tile: 'treemapResquarify',
              as: ['x', 'y']
             });

             const nodes = [];
             for (const node of dv.getAllNodes()) {
              if (node.data.name === 'root') {
                continue;
              }

              const eachNode: any = {
                name: node.data.name,
                x: node.x,
                y: node.y,
                value: node.data.value
              };

              nodes.push(eachNode);
             }

             setData(nodes);

        });
  }


  const scale = {
    x: {
      nice: true,
    },
    y: {
      nice: true,
    }
  };


  // build the UI
  return (
    <div className="widget-treemap jimu-widget m-2" ref={refContainer}>
      {!isLoaded && <Loading></Loading>}
      {isLoaded && <div>
          <div style={{display: 'inline-block'}}>
            <Select placeholder='Select layer...' style={{width: '200px', display: 'inline-block'}} value={currentFeatureLayer?.title} onChange={(e) => layerChange(e.target.value)}>
              {featureLayers && featureLayers.length > 0 && featureLayers.map(f => <Option value={f.title}>{f.title}</Option>)}
            </Select>
            <Select placeholder='Select field...' style={{width: '200px', display: 'inline-block'}} value={selectedAttribute} onChange={(e) => attributeChange(e.target.value)}>
              {currentAttributes && currentAttributes.length > 0 && currentAttributes.map(c => <Option value={c}>{c}</Option>)}
            </Select>
            <Tooltip title="Refresh the stats from current view"><Button onClick={(e) => attributeChange(selectedAttribute)}><RefreshOutlined /></Button></Tooltip>
            <a href="https://logicsolutionsgroup.com" target="_blank">
              <img style={{display: 'inline-block', marginLeft: '7px'}} src="https://images.squarespace-cdn.com/content/v1/5a3ab2ad90bade9f35107e99/1513890757134-4QKMF4VZ5TBTYUL4G8BY/logic-logo-light-bg-2.png?format=1500w" alt="logic" width="100" height="85" />
            </a>
            <h5 style={{display: 'inline-block', fontSize:'2.5em', verticalAlign: '-webkit-baseline-middle', marginLeft: '5px'}}>TreeMap Widget</h5>
          </div>
          {currentChartData && currentChartData.length > 0 && <Chart scale={scale} height={containerHeight > 0 ? containerHeight - 30 : 300} pure autoFit data={currentChartData}>
            <Polygon color="name" position="x*y" style={{lineWidth: 1, stroke: '#fff'}}
              label={['name', {
                offset: 0,
                style: {
                  textBaseline: 'middle'
                },
                content: (obj) => {
                  if (obj.name !== 'root') {
                    return obj.name;
                  }
                }
              }]}></Polygon>
          </Chart>}
      </div>}
    </div>
  );
}

