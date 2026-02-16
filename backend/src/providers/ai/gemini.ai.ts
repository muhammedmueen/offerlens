import { AiProvider, OfferContext } from './ai.provider.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '@/config/index.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export class GeminiAiProvider implements AiProvider {
    private genAI: GoogleGenerativeAI;
    private model: any;
    private simpleModel: any; // For metadata extraction without schema

    constructor() {
        if (!config.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        
        // Model for full analysis - using gemini-flash-latest by default
        // In development, this can be overridden per request
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.3,
                maxOutputTokens: 8192,
            },
        });
        
        // Simple model for metadata extraction without schema constraints
        this.simpleModel = this.genAI.getGenerativeModel({
            model: 'gemini-flash-lite-latest',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.3,
                maxOutputTokens: 2048,
            },
        });
    }

    async analyzeOffer(text: string, context?: OfferContext, model?: string): Promise<AnalysisResult> {
        try {
            const modelToUse = model || 'gemini-flash-latest';
            console.log('[Gemini AI] Using model for analysis:', modelToUse);
            
            // Create model instance with specified model name
            const analysisModel = this.genAI.getGenerativeModel({
                model: modelToUse,
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                },
            });
            
            const prompt = this.buildPrompt(text, context);
            const result = await analysisModel.generateContent(prompt);
            const response = await result.response;
            const jsonString = response.text();

            // Parse and validate (basic validation, Zod at service layer will handle strict check)
            const data = JSON.parse(jsonString);

            return data as AnalysisResult;
        } catch (error: any) {
            console.error('[Gemini AI] Analysis failed:', error);
            
            // Check for specific error types
            if (error.message?.includes('429') || error.status === 429) {
                throw new AppError(
                    ERROR_CODES.INTERNAL_ERROR,
                    'Rate limit exceeded. Please wait a few minutes or try a different model.',
                    429,
                    error
                );
            } else if (error.message?.includes('quota')) {
                throw new AppError(
                    ERROR_CODES.INTERNAL_ERROR,
                    'API quota exceeded. Please try again later or switch to a different model.',
                    429,
                    error
                );
            } else if (error.message?.includes('400') || error.status === 400) {
                throw new AppError(
                    ERROR_CODES.INTERNAL_ERROR,
                    'Invalid request to AI model. Please try a different model.',
                    400,
                    error
                );
            }
            
            throw new AppError(
                ERROR_CODES.INTERNAL_ERROR,
                'AI analysis failed: ' + (error.message || 'Unknown error'),
                500,
                error
            );
        }
    }

    async extractMetadata(text: string): Promise<any> {
        try {
            console.log('[Gemini AI] Starting metadata extraction, text length:', text.length);
            console.log('[Gemini AI] Text preview:', text.substring(0, 200));
            
            const prompt = `
                Extract the following fields from the offer letter text:
                - Role / Job Title
                - City / Location
                - Experience Level (choose from: "Fresher (0-1 yrs)", "Junior (1-3 yrs)", "Mid-Level (3-5 yrs)", "Senior (5-8 yrs)", "Staff/Lead (8-12 yrs)", "Principal/Director (12+ yrs)")
                - Current CTC (if mentioned, number only)
                - Currency (e.g. INR, USD)

                Output JSON with these exact keys: "role", "city", "experienceLevel", "currentCtc" (number), "currency".
                For experienceLevel, use one of the exact values listed above based on years of experience or job title.
                Return null for fields not found. Do not invent data.

                Text:
                """${text.substring(0, 10000)}""" 
            `;

            console.log('[Gemini AI] Sending request to Gemini API with model:', 'gemini-flash-lite-latest');
            const result = await this.simpleModel.generateContent(prompt);
            console.log('[Gemini AI] ✅ Received response from Gemini API');
            
            const response = await result.response;
            const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            
            console.log('[Gemini AI] Raw response:', jsonString);
            
            const parsed = JSON.parse(jsonString);
            console.log('[Gemini AI] ✅ Parsed metadata successfully:', JSON.stringify(parsed, null, 2));
            
            return parsed;
        } catch (error) {
            console.error('[Gemini AI] ❌ Metadata extraction failed:', error);
            console.error('[Gemini AI] Error details:', {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined
            });
            
            // Return empty object so the flow continues
            return {};
        }
    }

    async generateCareerPath(input: { role: string; companyType: string; industry: string }): Promise<any> {
        try {
            const prompt = `
                Act as a career counselor.
                Create a 5-year career trajectory for a ${input.role} in the ${input.industry} industry.
                
                Output JSON with this structure:
                {
                    "timeline": [
                        { "year": 1, "title": "...", "focus": "...", "salaryRange": "..." },
                        { "year": 3, "title": "...", "focus": "...", "salaryRange": "..." },
                        { "year": 5, "title": "...", "focus": "...", "salaryRange": "..." }
                    ],
                    "skillsToLearn": ["...", "..."],
                    "potentialRoles": ["...", "..."]
                }
                
                Do not acknowledge or explain, just output valid JSON.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('AI career path generation failed', error);
            // Fallback
            return {
                timeline: [],
                skillsToLearn: [],
                potentialRoles: [],
                error: 'Failed to generate career path'
            };
        }
    }

    async generateNegotiationScript(input: any): Promise<{ subject: string; body: string }> {
        try {
            const prompt = `
                Act as a professional career coach and negotiation expert.
                Write a negotiation email for a job offer.

                Context:
                - Company: ${input.companyName}
                - Role: ${input.role}
                - Tone: ${input.tone} (professional, assertive, or friendly)
                - Focus Areas: ${input.focusAreas?.join(', ') || 'General compensation and benefits'}
                
                Offer Details:
                ${JSON.stringify(input.currentOffer, null, 2)}

                Market Data:
                ${JSON.stringify(input.marketData, null, 2)}

                Negotiation Points to Include:
                ${JSON.stringify(input.suggestions, null, 2)}

                Output JSON with keys: "subject" and "body".
                The body should be the email content, ready to send (with placeholders for name if needed).
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean up code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (error) {
            console.error('AI negotiation script generation failed', error);
            // Fallback
            return {
                subject: `Negotiation regarding ${input.role} offer`,
                body: `Dear Hiring Manager,\n\nI am writing to discuss... [AI generation failed, please use template]`
            };
        }
    }

    private buildPrompt(text: string, context?: OfferContext): string {
        // Simplified prompt construction based on ai-prompts.md
        // In real impl, this would load the full system prompt from a file or constant
        return `
      You are an expert HR compensation analyst and legal advisor.
      Analyze the following offer letter text and extract structured data.
      
      User Context: ${JSON.stringify(context || {})}
      
      Offer Text:
      """
      ${text}
      """
      
      Output compliant JSON matching the AnalysisResult interface.
      Ensure strict adherence to the schema.
      Check for red flags, benefits, and salary details.
    `;
    }
}
