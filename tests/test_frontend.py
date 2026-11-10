"""Independent resource migration and dashboard lifecycle tests."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType,SimpleNamespace as NS
import unittest
from unittest.mock import AsyncMock,patch

ROOT=Path(__file__).parents[1]/'custom_components/thingslocal_dashboard'
def mod(name,**attrs):
    module=ModuleType(name);module.__dict__.update(attrs);return module

class Resources:
    def __init__(self,items=()):self.data=list(items)
    async def async_get_info(self):return {}
    def async_items(self):return self.data
    async def async_create_item(self,item):self.data.append({'id':'new',**item})
    async def async_update_item(self,key,item):next(row for row in self.data if row['id']==key).update(item)
    async def async_delete_item(self,key):self.data[:]=[row for row in self.data if row['id']!=key]

class FrontendTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        package=mod('thingslocal_dashboard_test');package.__path__=[str(ROOT)]
        self.panels={}
        frontend=mod('homeassistant.components.frontend',async_panel_exists=lambda hass,path:path in self.panels,
            async_register_built_in_panel=lambda hass,kind,**kw:self.panels.update({kw['frontend_url_path']:kw}),
            async_remove_panel=lambda hass,path:self.panels.pop(path,None))
        class Dashboard:
            def __init__(self,hass,path,config):self.config=config
            async def async_load(self,force):
                if not Path(self.config['filename']).exists():raise FileNotFoundError
        self.patch=patch.dict(sys.modules,{
            'thingslocal_dashboard_test':package,'homeassistant':mod('homeassistant'),
            'homeassistant.components':mod('homeassistant.components',frontend=frontend),
            'homeassistant.components.frontend':frontend,
            'homeassistant.components.http':mod('http',StaticPathConfig=lambda *args:args),
            'homeassistant.components.lovelace.const':mod('const',LOVELACE_DATA='lovelace'),
            'homeassistant.components.lovelace.dashboard':mod('dashboard',LovelaceYAML=Dashboard),
            'homeassistant.exceptions':mod('exceptions',HomeAssistantError=RuntimeError),
        });self.patch.start();self.addCleanup(self.patch.stop)
        spec=importlib.util.spec_from_file_location('thingslocal_dashboard_test.frontend',ROOT/'frontend.py');self.frontend=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.frontend)
        self.resources=Resources();self.hass=NS(data={'lovelace':NS(resources=self.resources,dashboards={},yaml_dashboards={})},http=NS(async_register_static_paths=AsyncMock()))
    async def test_versioned_resources_replace_duplicates_and_preserve_heating(self):
        self.resources.data=[{'id':'old','url':'/thingslocal_dashboard/thingslocal-dashboard-card.js?v=old'},{'id':'duplicate','url':'/thingslocal_dashboard/thingslocal-dashboard-card.js'},{'id':'heating','url':'/central_heating/central-heating-card.js'}]
        await self.frontend.async_register_card(self.hass);await self.frontend.async_register_card(self.hass)
        self.hass.http.async_register_static_paths.assert_awaited_once()
        self.assertEqual(len(self.resources.data),2);self.assertIn('v=0.1.0',self.resources.data[0]['url']);self.assertEqual(self.resources.data[1]['id'],'heating')
    def test_external_resources_not_claimed(self):
        self.assertFalse(self.frontend.is_our_resource({'url':'https://example.com/thingslocal_dashboard/thingslocal-dashboard-card.js'}))
    async def test_own_dashboard_and_unload_preserve_other_dashboards(self):
        old=object();self.hass.data['lovelace'].dashboards['central-heating']=old
        own=await self.frontend.async_register_dashboard(self.hass)
        self.assertEqual(self.panels['thingslocal-dashboard']['sidebar_title'],'ThingsLocal')
        self.assertFalse(self.panels['thingslocal-dashboard']['require_admin'])
        self.frontend.async_remove_dashboard(self.hass,own)
        self.assertNotIn('thingslocal-dashboard',self.panels);self.assertIs(self.hass.data['lovelace'].dashboards['central-heating'],old)
    async def test_existing_panel_is_not_overwritten(self):
        self.panels['thingslocal-dashboard']={'other':True}
        with self.assertRaises(RuntimeError):await self.frontend.async_register_dashboard(self.hass)
        self.assertEqual(self.panels['thingslocal-dashboard'],{'other':True})
    async def test_unload_does_not_remove_replacement(self):
        own=await self.frontend.async_register_dashboard(self.hass);replacement=object();self.hass.data['lovelace'].dashboards['thingslocal-dashboard']=replacement
        self.frontend.async_remove_dashboard(self.hass,own)
        self.assertIs(self.hass.data['lovelace'].dashboards['thingslocal-dashboard'],replacement)
    async def test_yaml_resources_keep_their_mode(self):
        self.resources.async_create_item=None
        # YAML collections lack mutation methods entirely.
        self.resources=NS(data=[],async_get_info=AsyncMock(),async_items=lambda:[])
        self.hass.data['lovelace'].resources=self.resources
        await self.frontend.async_register_card(self.hass)
        self.assertIn('v=0.1.0',self.resources.data[0]['url'])
