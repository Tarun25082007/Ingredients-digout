package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@Service
public class GeminiService {

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=";
    private static final String PROMPT = "Extract the ingredients from this image. Evaluate them strictly against WHO guidelines. Flag artificial sweeteners (even in 'zero sugar' drinks), preservatives, and carcinogens. Output ONLY a raw JSON object with keys: 'productName' (string), 'ingredientsFound' (array of strings), 'whoFlags' (array of objects with 'name', 'status', 'explanation'), 'overallIndicator' (string: RED, YELLOW, or GREEN).";

    public GeminiService(@Value("${gemini.api.key}") String geminiApiKey, RestTemplate restTemplate, ObjectMapper objectMapper) {
        this.geminiApiKey = geminiApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    public WhoAssessmentDTO analyzeIngredients(String base64Image, String mimeType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            // Construct Gemini API Payload
            Map<String, Object> payload = Map.of(
                    "contents", List.of(
                            Map.of("parts", List.of(
                                    Map.of("text", PROMPT),
                                    Map.of("inline_data", Map.of(
                                            "mime_type", mimeType,
                                            "data", base64Image
                                    ))
                            ))
                    ),
                    "generationConfig", Map.of(
                            "responseMimeType", "application/json"
                    )
            );

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);

            // Parse the response
            JsonNode root = objectMapper.readTree(response.getBody());
            String jsonText = root.path("candidates").get(0)
                    .path("content").path("parts").get(0)
                    .path("text").asText();

            // Clean markdown JSON formatting if Gemini includes it despite responseMimeType
            if (jsonText.startsWith("```json")) {
                jsonText = jsonText.substring(7, jsonText.length() - 3).trim();
            } else if (jsonText.startsWith("```")) {
                jsonText = jsonText.substring(3, jsonText.length() - 3).trim();
            }

            return objectMapper.readValue(jsonText, WhoAssessmentDTO.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to analyze ingredients with Gemini API: " + e.getMessage(), e);
        }
    }
}
