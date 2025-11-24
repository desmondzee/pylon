import unittest
from unittest.mock import patch, MagicMock
import json
import sys
import os

# Add backend to path
sys.path.append(os.path.abspath("/Users/desmondzee/Coding/Pylon/backend"))

from compute_agent import ComputeAgent
from energy_agent import EnergyAgent
from head_agent import app

class TestAgents(unittest.TestCase):

    @patch('compute_agent.get_gemini_json_response')
    @patch('compute_agent.log_agent_action')
    def test_compute_agent(self, mock_log, mock_gemini):
        print("\nTesting Compute Agent...")
        agent = ComputeAgent()
        
        mock_gemini.return_value = {
            "workload_type": "ai_training",
            "estimated_duration_hours": 5.0,
            "estimated_energy_kwh": 10.0,
            "priority": 80
        }
        
        result = agent.analyze_task("Train a model")
        
        self.assertEqual(result['workload_type'], "ai_training")
        mock_log.assert_called_once()
        print("Compute Agent Test Passed!")

    @patch('energy_agent.get_gemini_json_response')
    @patch('energy_agent.log_agent_action')
    @patch('energy_agent.supabase')
    def test_energy_agent(self, mock_supabase, mock_log, mock_gemini):
        print("\nTesting Energy Agent...")
        agent = EnergyAgent()
        
        # Mock Supabase response
        mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value.data = [
            {"region_name": "North Scotland", "forecast_gco2_kwh": 10}
        ]
        
        mock_gemini.return_value = {
            "recommended_region": "North Scotland",
            "reasoning": "Low carbon",
            "estimated_carbon_intensity": 10
        }
        
        result = agent.find_optimal_slot({"energy": 100})
        
        self.assertEqual(result['recommended_region'], "North Scotland")
        print("Energy Agent Test Passed!")

    @patch('head_agent.get_gemini_json_response')
    @patch('head_agent.execute_beckn_search')
    @patch('head_agent.compute_agent.analyze_task')
    @patch('head_agent.energy_agent.find_optimal_slot')
    @patch('head_agent.data_fetcher.fetch_all_data')
    @patch('head_agent.supabase')
    def test_head_agent_flow(self, mock_supabase, mock_fetch, mock_energy, mock_compute, mock_beckn, mock_gemini):
        print("\nTesting Head Agent Flow...")
        
        # Mock dependencies
        mock_compute.return_value = {"workload": "test"}
        mock_energy.return_value = {"region": "test"}
        mock_gemini.return_value = {
            "decision": "proceed",
            "beckn_search_query": "test query"
        }
        mock_beckn.return_value = {"status": "ACK"}
        
        with app.test_client() as client:
            response = client.post('/submit_task', json={"request": "Test task"})
            
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertEqual(data['status'], "processing")
            self.assertEqual(data['beckn_status']['status'], "ACK")
            
        print("Head Agent Flow Test Passed!")

if __name__ == '__main__':
    unittest.main()
