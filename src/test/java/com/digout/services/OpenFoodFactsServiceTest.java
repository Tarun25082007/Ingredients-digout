package com.digout.services;

import com.digout.dto.OpenFoodFactsDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class OpenFoodFactsServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private ObjectMapper objectMapper = new ObjectMapper();

    private OpenFoodFactsService openFoodFactsService;

    @BeforeEach
    void setUp() {
        openFoodFactsService = new OpenFoodFactsService(restTemplate, objectMapper);
    }

    @Test
    void testSearchProductByName_Success() {
        String mockResponseJson = "{\"products\":[{\"product_name\":\"Test Product\",\"ingredients_text\":\"Water, Sugar\"}]}";
        ResponseEntity<String> mockResponseEntity = new ResponseEntity<>(mockResponseJson, HttpStatus.OK);

        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenReturn(mockResponseEntity);

        OpenFoodFactsDTO result = openFoodFactsService.searchProductByName("Test Product");

        assertNotNull(result);
        assertEquals("Test Product", result.productName());
        assertEquals("Water, Sugar", result.ingredientsText());
    }

    @Test
    void testSearchProductByName_NoProductsFound() {
        String mockResponseJson = "{\"products\":[]}";
        ResponseEntity<String> mockResponseEntity = new ResponseEntity<>(mockResponseJson, HttpStatus.OK);

        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenReturn(mockResponseEntity);

        Exception exception = assertThrows(RuntimeException.class, () -> {
            openFoodFactsService.searchProductByName("Unknown Product");
        });

        assertTrue(exception.getMessage().contains("No products found matching name"));
    }

    @Test
    void testSearchProductByName_ConnectionError() {
        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenThrow(new ResourceAccessException("Connection timed out"));

        Exception exception = assertThrows(RuntimeException.class, () -> {
            openFoodFactsService.searchProductByName("Test Product");
        });

        assertTrue(exception.getMessage().contains("Timeout or connection error"));
    }
}
