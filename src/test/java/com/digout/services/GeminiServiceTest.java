package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class GeminiServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private ObjectMapper objectMapper = new ObjectMapper();

    private GeminiService geminiService;

    @BeforeEach
    void setUp() {
        geminiService = new GeminiService("fake-api-key", restTemplate, objectMapper);
    }

    @Test
    void testAnalyzeIngredients_Success() throws Exception {
        // Arrange
        String mockResponseJson = "{\"interactionId\":\"test_123\",\"steps\":[{\"modelOutput\":{\"text\":\"```json\\n{\\\"productName\\\":\\\"Test Product\\\",\\\"globalEquivalent\\\":\\\"Test Product\\\",\\\"ingredientsFound\\\":[],\\\"whoFlags\\\":[],\\\"overallIndicator\\\":\\\"GREEN\\\"}\\n```\"}}]}";
        
        ResponseEntity<String> mockResponseEntity = new ResponseEntity<>(mockResponseJson, HttpStatus.OK);
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(String.class)))
                .thenReturn(mockResponseEntity);

        // Act
        CompletableFuture<WhoAssessmentDTO> future = geminiService.analyzeIngredients("base64data", "image/jpeg");
        WhoAssessmentDTO result = future.get();

        // Assert
        assertNotNull(result);
        assertEquals("Test Product", result.productName());
        assertEquals("GREEN", result.overallIndicator());
        verify(restTemplate, times(1)).postForEntity(anyString(), any(HttpEntity.class), eq(String.class));
    }

    @Test
    void testAnalyzeIngredients_RetryOnTimeoutAndFail() {
        // Arrange
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("503 Service Unavailable"));

        // Act & Assert
        Exception exception = assertThrows(RuntimeException.class, () -> {
            geminiService.analyzeIngredients("base64data", "image/jpeg");
        });

        assertTrue(exception.getMessage().contains("Failed to analyze ingredients with Gemini API after retries"));
        // It should have retried 3 times
        verify(restTemplate, times(3)).postForEntity(anyString(), any(HttpEntity.class), eq(String.class));
    }
}
